import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { desc, gt } from "drizzle-orm";
import { REPORT_TYPES, ReportType } from "../community/report-types";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { roadReports } from "../db/schema";
import { AlertsService } from "../live/alerts.service";
import { LngLat, RouteIncident, RouteNotice } from "../routing/routing.types";
import { distanceToLineM, thinLine } from "../telematics/geo";
import { Stop, TripsService } from "./trips.service";

/** A driver road report lying on a trip's remaining route. */
export interface RouteReport {
  id: string;
  type: string;
  label: string;
  note: string;
  point: LngLat;
  createdAt: string;
}

export interface TripTraffic {
  truckId: string;
  truckNumber: string;
  cargoId: string;
  cargo: string;
  nextStop: Stop;
  /** Drive time and distance to the next stop; null when the truck's position is unknown. */
  remainingS: number | null;
  remainingM: number | null;
  etaAt: string | null;
  /** Extra time caused by current traffic compared with usual conditions. */
  trafficDelayS: number;
  incidents: RouteIncident[];
  violations: RouteNotice[];
  /** A dispatcher assigned this truck knowing its route breaks truck restrictions. */
  restrictionsAccepted: boolean;
  reportedDelay: { minutes: number; reason: string | null; at: string } | null;
  /** The remaining route from the truck (or the first stop) through the load's stops. */
  geometry: LngLat[] | null;
  /** Where along `geometry` the pickup is, when the truck is still on its way there. */
  toPickupM: number | null;
  roadReports: RouteReport[];
}

const IMPACT_ORDER = ["critical", "major", "minor", "low", "unknown"];
// Alert at every further 15 minutes of traffic delay.
const DELAY_STEP_S = 15 * 60;
// A driver report this close to a route counts as "on the way".
const ROUTE_REPORT_RADIUS_M = 1000;
// Routes are sent to dispatcher maps every few minutes; this detail is plenty at fleet zoom.
const ROUTE_DETAIL_M = 150;
// Reports that need a dispatcher's attention rather than just a heads-up.
const SERIOUS_REPORTS = new Set(["accident", "closure"]);

/**
 * Checks every active trip's remaining route against live traffic, keeps the latest
 * report, and raises alerts for growing delays, closures and major incidents.
 */
@Injectable()
export class TrafficService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TrafficService.name);
  private latest?: { at: Date; trips: TripTraffic[] };
  private running?: Promise<TripTraffic[]>;
  private readonly alerted = new Set<string>();
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly trips: TripsService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get("TRAFFIC_MONITOR_INTERVAL_MS") ?? 5 * 60_000);
  }

  onApplicationBootstrap() {
    if (this.intervalMs > 0) this.timer = setInterval(() => void this.run().catch(() => undefined), this.intervalMs);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** The latest report, refreshed when older than the monitor interval. */
  async report() {
    const maxAge = this.intervalMs > 0 ? this.intervalMs : 5 * 60_000;
    if (!this.latest || Date.now() - this.latest.at.getTime() > maxAge) await this.run();
    return { checkedAt: this.latest!.at.toISOString(), trips: this.latest!.trips };
  }

  run(): Promise<TripTraffic[]> {
    // Concurrent callers share one run instead of re-billing the routing API.
    this.running ??= this.check().finally(() => (this.running = undefined));
    return this.running;
  }

  private async check(): Promise<TripTraffic[]> {
    const [trips, reports] = await Promise.all([this.trips.activeTrips(), this.activeReports()]);
    const results: TripTraffic[] = [];
    for (const trip of trips) {
      let route = null;
      try {
        route = await this.trips.routeFor(trip);
      } catch (err) {
        this.logger.warn(`Traffic check failed for truck ${trip.truck.truckNumber}: ${(err as Error).message}`);
      }
      // With a known position the first leg runs from the truck to the next stop.
      const toNextStop = trip.position ? route?.legs[0] : undefined;
      const remainingS = toNextStop?.durationS ?? null;
      const fullRoute = route?.geometry.coordinates;
      results.push({
        truckId: trip.truck.id,
        truckNumber: trip.truck.truckNumber,
        cargoId: trip.cargo.id,
        cargo: `${trip.cargo.pickupLocation} → ${trip.cargo.deliveryLocation}`,
        nextStop: trip.nextStop,
        remainingS,
        remainingM: toNextStop?.distanceM ?? null,
        etaAt: remainingS === null ? null : new Date(Date.now() + remainingS * 1000).toISOString(),
        trafficDelayS: route?.typicalDurationS ? Math.max(0, Math.round(route.durationS - route.typicalDurationS)) : 0,
        incidents: [...(route?.incidents ?? [])].sort(
          (a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact),
        ),
        violations: (route?.notices ?? []).filter((n) => n.type === "violation"),
        restrictionsAccepted: trip.cargo.restrictionsAcceptedTruckId === trip.truck.id,
        reportedDelay: trip.cargo.delayMinutes
          ? {
              minutes: trip.cargo.delayMinutes,
              reason: trip.cargo.delayReason,
              at: trip.cargo.delayReportedAt!.toISOString(),
            }
          : null,
        geometry: fullRoute ? thinLine(fullRoute, ROUTE_DETAIL_M) : null,
        toPickupM: toNextStop && trip.nextStop.kind === "pickup" ? toNextStop.distanceM : null,
        roadReports: fullRoute ? reports.filter((report) => this.isOnRoute(report, fullRoute)) : [],
      });
    }
    this.trips.retainRoutes(trips);
    this.forgetFinishedAlerts(trips.map((trip) => trip.cargo.id));
    this.latest = { at: new Date(), trips: results };
    results.forEach((trip) => this.raiseAlerts(trip));
    return results;
  }

  /**
   * A driver just posted a report: if it lies on an active trip's route, add it to that
   * trip in the latest report and alert dispatchers right away instead of at the next check.
   */
  flagRoadReport(report: RouteReport) {
    for (const trip of this.latest?.trips ?? []) {
      if (!trip.geometry || !this.isOnRoute(report, trip.geometry)) continue;
      trip.roadReports = [report, ...trip.roadReports.filter((r) => r.id !== report.id)];
      this.raiseReportAlert(trip, report);
    }
  }

  /** Alert keys start with the cargo id; drop those of loads no longer on the road so the set stays small. */
  private forgetFinishedAlerts(activeCargoIds: string[]) {
    const active = new Set(activeCargoIds);
    for (const key of this.alerted) {
      if (!active.has(key.slice(0, key.indexOf(":")))) this.alerted.delete(key);
    }
  }

  private isOnRoute(report: RouteReport, geometry: LngLat[]) {
    return geometry.length > 0 && distanceToLineM(report.point, geometry) <= ROUTE_REPORT_RADIUS_M;
  }

  private async activeReports(): Promise<RouteReport[]> {
    const rows = await this.db
      .select({
        id: roadReports.id,
        type: roadReports.type,
        note: roadReports.note,
        point: roadReports.point,
        createdAt: roadReports.createdAt,
      })
      .from(roadReports)
      .where(gt(roadReports.expiresAt, new Date()))
      .orderBy(desc(roadReports.createdAt));
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      label: REPORT_TYPES[row.type as ReportType]?.label ?? row.type,
      note: row.note,
      point: [row.point.x, row.point.y],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private raiseReportAlert(trip: TripTraffic, report: RouteReport) {
    const key = `${trip.cargoId}:report:${report.id}`;
    if (this.alerted.has(key)) return;
    this.alerted.add(key);
    this.alerts.raise({
      kind: "road-report",
      severity: SERIOUS_REPORTS.has(report.type) ? "warning" : "info",
      message: `${trip.truckNumber}: driver reported ${report.label.toLowerCase()} on the route to ${trip.nextStop.name}${report.note ? ` – ${report.note}` : ""}`,
      cargoId: trip.cargoId,
      truckId: trip.truckId,
    });
  }

  private raiseAlerts(trip: TripTraffic) {
    const once = (key: string, raise: () => void) => {
      if (this.alerted.has(key)) return;
      this.alerted.add(key);
      raise();
    };

    const step = Math.floor(trip.trafficDelayS / DELAY_STEP_S);
    if (step > 0) {
      once(`${trip.cargoId}:delay:${step}`, () =>
        this.alerts.raise({
          kind: "traffic-delay",
          severity: step >= 4 ? "critical" : "warning",
          message: `${trip.truckNumber}: traffic adds ${Math.round(trip.trafficDelayS / 60)} min on the way to ${trip.nextStop.name}`,
          cargoId: trip.cargoId,
          truckId: trip.truckId,
        }),
      );
    }

    for (const incident of trip.incidents) {
      if (!incident.closed && !["critical", "major"].includes(incident.impact)) continue;
      // Mapbox splits long roadworks into several incidents with the same description.
      once(`${trip.cargoId}:incident:${incident.closed}:${incident.impact}:${incident.description}`, () =>
        this.alerts.raise({
          kind: "incident",
          severity: incident.closed || incident.impact === "critical" ? "critical" : "warning",
          message: `${trip.truckNumber}: ${incident.closed ? "road closed" : `${incident.impact} ${incident.type}`} on route to ${trip.nextStop.name} – ${incident.description}`,
          cargoId: trip.cargoId,
          truckId: trip.truckId,
        }),
      );
    }

    // Accepted restrictions were already alerted when the dispatcher assigned the truck.
    if (trip.violations.length && !trip.restrictionsAccepted) {
      once(`${trip.cargoId}:${trip.truckId}:restrictions`, () =>
        this.alerts.raise({
          kind: "route-restriction",
          severity: "critical",
          message: `${trip.truckNumber}: ${trip.violations.length} truck restriction${trip.violations.length === 1 ? "" : "s"} on the route to ${trip.nextStop.name} – ${trip.violations[0].message}`,
          cargoId: trip.cargoId,
          truckId: trip.truckId,
        }),
      );
    }

    trip.roadReports.forEach((report) => this.raiseReportAlert(trip, report));
  }
}
