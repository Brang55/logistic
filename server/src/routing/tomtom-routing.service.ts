import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { TomTomApiError, TomTomClient } from "../tomtom/tomtom.client";
import { MapboxRoutingService } from "./mapbox-routing.service";
import { TtlCache } from "./ttl-cache";
import {
  LngLat,
  RouteIncident,
  RouteNotice,
  RoutePlan,
  RouteRequest,
  RoutingService,
  TravelEstimate,
  VehicleDimensions,
} from "./routing.types";

// Subset of the Calculate Route response that we use.
interface TomTomPoint {
  latitude: number;
  longitude: number;
}

interface TomTomSummary {
  lengthInMeters: number;
  travelTimeInSeconds: number;
  trafficDelayInSeconds?: number;
}

interface TomTomSection {
  startPointIndex: number;
  endPointIndex: number;
  sectionType: string;
  travelMode?: string;
  countryCode?: string;
  simpleCategory?: "JAM" | "ROAD_WORK" | "ROAD_CLOSURE" | "OTHER";
  magnitudeOfDelay?: number;
  delayInSeconds?: number;
  eventId?: string;
}

interface TomTomInstruction {
  routeOffsetInMeters: number;
  travelTimeInSeconds: number;
  point: TomTomPoint;
  message?: string;
  roadNumbers?: string[];
}

interface TomTomRoute {
  summary: TomTomSummary;
  legs: { summary: TomTomSummary; points: TomTomPoint[] }[];
  sections?: TomTomSection[];
  guidance?: { instructions: TomTomInstruction[] };
}

interface MatrixCell {
  originIndex: number;
  destinationIndex: number;
  routeSummary?: { lengthInMeters: number; travelTimeInSeconds: number };
  detailedError?: { code: string };
}

const NO_ROUTE_CODES = new Set(["NO_ROUTE_FOUND", "MAP_MATCHING_FAILURE"]);
const MAX_COORDINATES = 25;

/** TomTom itself failed or refused (key, quota, outage), as opposed to rejecting our input. */
const providerFailed = (err: unknown) =>
  !(err instanceof TomTomApiError) || err.status >= 500 || [401, 403, 429].includes(err.status);

const INCIDENT_TYPES: Record<string, string> = {
  JAM: "congestion",
  ROAD_WORK: "construction",
  ROAD_CLOSURE: "road_closure",
  OTHER: "miscellaneous",
};
const INCIDENT_LABELS: Record<string, string> = {
  JAM: "Traffic jam",
  ROAD_WORK: "Roadworks",
  ROAD_CLOSURE: "Road closed",
  OTHER: "Traffic incident",
};
// TomTom's magnitudeOfDelay: 0 unknown, 1 minor, 2 moderate, 3 major, 4 undefined (closures).
const IMPACTS = ["unknown", "minor", "major", "critical", "critical"];

const positive = (value: number | null | undefined) => (value && value > 0 ? value : undefined);

/** Truck parameters shared by Calculate Route and Matrix; unset limits are left out. */
export const truckOptions = (vehicle: VehicleDimensions = {}) => {
  const weightKg = positive(vehicle.weightT) && Math.round(vehicle.weightT! * 1000);
  const axles = positive(vehicle.axles);
  return {
    vehicleHeight: positive(vehicle.heightM),
    vehicleWidth: positive(vehicle.widthM),
    vehicleLength: positive(vehicle.lengthM),
    vehicleWeight: weightKg || undefined,
    vehicleNumberOfAxles: axles,
    // Evenly spread: TomTom checks per-axle limits on bridges and weak roads.
    vehicleAxleWeight: weightKg && axles ? Math.round(weightKg / axles) : undefined,
  };
};

const asParams = (options: Record<string, number | undefined>) =>
  Object.fromEntries(Object.entries(options).map(([key, value]) => [key, value === undefined ? undefined : String(value)]));

@Injectable()
export class TomTomRoutingService extends RoutingService {
  private readonly logger = new Logger(TomTomRoutingService.name);
  private readonly cache = new TtlCache<RoutePlan[]>(5 * 60_000, 200);
  private fallingBack = false;

  constructor(
    private readonly tomtom: TomTomClient,
    private readonly mapbox: MapboxRoutingService,
  ) {
    super();
  }

  async route({ coordinates, vehicle, alternatives = true }: RouteRequest): Promise<RoutePlan[]> {
    if (coordinates.length < 2 || coordinates.length > MAX_COORDINATES) {
      throw new BadRequestException(`A route needs between 2 and ${MAX_COORDINATES} coordinates`);
    }

    const path = `/routing/1/calculateRoute/${coordinates.map(([lng, lat]) => `${lat},${lng}`).join(":")}/json`;
    const params = {
      travelMode: "truck",
      vehicleCommercial: "true",
      traffic: "true",
      computeTravelTimeFor: "all",
      // Alternatives are only offered between two points, as with Mapbox.
      maxAlternatives: alternatives && coordinates.length === 2 ? "2" : "0",
      instructionsType: "text",
      language: "en-US",
      sectionType: ["traffic", "travelMode", "country", "toll", "tunnel"],
      ...asParams(truckOptions(vehicle)),
    };
    const key = JSON.stringify([path, params]);
    const cached = this.cache.get(key);
    if (cached) return cached;

    let response: { routes: TomTomRoute[] };
    try {
      response = await this.tomtom.get<{ routes: TomTomRoute[] }>(path, params);
    } catch (err) {
      if (!(err instanceof TomTomApiError)) throw err;
      if (err.code && NO_ROUTE_CODES.has(err.code)) return [];
      if (providerFailed(err)) throw new BadGatewayException("Routing provider is unavailable");
      throw new BadRequestException(err.message);
    }

    const plans = (response.routes ?? []).map(toPlan);
    this.cache.set(key, plans);
    return plans;
  }

  async travelTimes(origin: LngLat, destinations: LngLat[], vehicle?: VehicleDimensions): Promise<TravelEstimate[]> {
    if (!destinations.length) return [];
    if (destinations.length > this.maxMatrixDestinations) {
      throw new BadRequestException(`At most ${this.maxMatrixDestinations} destinations per request`);
    }
    const point = ([lng, lat]: LngLat) => ({ point: { latitude: lat, longitude: lng } });
    let cells: MatrixCell[];
    try {
      const response = await this.tomtom.post<{ data: MatrixCell[] }>("/routing/matrix/2", {
        origins: [point(origin)],
        destinations: destinations.map(point),
        options: { departAt: "now", traffic: "live", travelMode: "truck", vehicleCommercial: true, ...truckOptions(vehicle) },
      });
      cells = response.data ?? [];
    } catch (err) {
      if (!providerFailed(err)) throw new BadRequestException((err as Error).message);
      // Truck times are better, but car times keep next-pickup suggestions working.
      if (!this.fallingBack) {
        this.logger.warn(`TomTom matrix unavailable (${(err as Error).message}); using Mapbox car times until it recovers`);
        this.fallingBack = true;
      }
      return this.mapbox.travelTimes(origin, destinations);
    }
    if (this.fallingBack) {
      this.logger.log("TomTom matrix is back; using truck travel times again");
      this.fallingBack = false;
    }

    const byDestination = new Map(cells.map((cell) => [cell.destinationIndex, cell.routeSummary]));
    return destinations.map((_, i) => {
      const summary = byDestination.get(i);
      return { durationS: summary?.travelTimeInSeconds ?? null, distanceM: summary?.lengthInMeters ?? null };
    });
  }
}

export function toPlan(route: TomTomRoute): RoutePlan {
  // Section point indices refer to the legs' points laid end to end.
  const coords: LngLat[] = route.legs.flatMap((leg) => leg.points.map((p): LngLat => [p.longitude, p.latitude]));
  const slice = (section: TomTomSection) => coords.slice(section.startPointIndex, section.endPointIndex + 1);
  const sections = route.sections ?? [];
  const notices: RouteNotice[] = [];
  const incidents: RouteIncident[] = [];

  let countries = 0;
  for (const [index, section] of sections.entries()) {
    switch (section.sectionType) {
      case "TRAVEL_MODE":
        // The truck can't avoid this part, e.g. a delivery inside a restricted zone.
        if (section.travelMode === "other") {
          notices.push({
            type: "violation",
            subtype: "truckRestriction",
            message: "Part of this route is not permitted for this truck",
            coordinates: slice(section),
          });
        }
        break;
      case "COUNTRY":
        if (countries++ > 0) {
          notices.push({
            type: "alert",
            subtype: "countryBorderCrossing",
            message: `Border crossing into ${section.countryCode ?? "another country"}`,
            coordinates: [coords[section.startPointIndex]],
          });
        }
        break;
      case "TOLL":
        notices.push({ type: "alert", subtype: "toll", message: "Toll road", coordinates: slice(section) });
        break;
      case "TUNNEL":
        notices.push({ type: "alert", subtype: "tunnel", message: "Tunnel", coordinates: slice(section) });
        break;
      case "TRAFFIC": {
        const category = section.simpleCategory ?? "OTHER";
        const delayMin = Math.round((section.delayInSeconds ?? 0) / 60);
        incidents.push({
          id: section.eventId ?? `traffic-${index}`,
          type: INCIDENT_TYPES[category] ?? "miscellaneous",
          description: `${INCIDENT_LABELS[category] ?? "Traffic incident"}${delayMin > 0 ? `, +${delayMin} min` : ""}`,
          impact: IMPACTS[section.magnitudeOfDelay ?? 0] ?? "unknown",
          closed: category === "ROAD_CLOSURE" || section.magnitudeOfDelay === 4,
          location: coords[section.startPointIndex],
        });
        break;
      }
    }
  }

  const instructions = route.guidance?.instructions ?? [];
  const steps = instructions.map((instruction, i) => {
    const next = instructions[i + 1];
    return {
      instruction: instruction.message ?? "",
      distanceM: next ? next.routeOffsetInMeters - instruction.routeOffsetInMeters : 0,
      durationS: next ? next.travelTimeInSeconds - instruction.travelTimeInSeconds : 0,
      location: [instruction.point.longitude, instruction.point.latitude] as LngLat,
    };
  });
  // Main roads in driving order, e.g. "I-35E → I-44".
  const roads = [...new Set(instructions.flatMap((instruction) => instruction.roadNumbers?.slice(0, 1) ?? []))];

  const { summary } = route;
  return {
    distanceM: summary.lengthInMeters,
    durationS: summary.travelTimeInSeconds,
    typicalDurationS: summary.travelTimeInSeconds - (summary.trafficDelayInSeconds ?? 0),
    summary: roads.slice(0, 4).join(" → "),
    geometry: { type: "LineString", coordinates: coords },
    legs: route.legs.map((leg) => ({ distanceM: leg.summary.lengthInMeters, durationS: leg.summary.travelTimeInSeconds })),
    steps,
    notices,
    incidents,
  };
}
