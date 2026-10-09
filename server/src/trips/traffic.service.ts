import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertsService } from "../live/alerts.service";
import { RouteIncident, RouteNotice } from "../routing/routing.types";
import { Stop, TripsService } from "./trips.service";

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
  reportedDelay: { minutes: number; reason: string | null; at: string } | null;
}

const IMPACT_ORDER = ["critical", "major", "minor", "low", "unknown"];
// Alert at every further 15 minutes of traffic delay.
const DELAY_STEP_S = 15 * 60;

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
    const trips = await this.trips.activeTrips();
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
        reportedDelay: trip.cargo.delayMinutes
          ? {
              minutes: trip.cargo.delayMinutes,
              reason: trip.cargo.delayReason,
              at: trip.cargo.delayReportedAt!.toISOString(),
            }
          : null,
      });
    }
    this.latest = { at: new Date(), trips: results };
    results.forEach((trip) => this.raiseAlerts(trip));
    return results;
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
  }
}
