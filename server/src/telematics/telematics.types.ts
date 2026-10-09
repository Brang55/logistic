import { LngLat } from "../routing/routing.types";

/** One GPS fix from a telematics source. */
export interface PositionFix {
  /** Our truck id (internal sources such as the simulator). */
  truckId?: string;
  /** The provider's vehicle id; matched against trucks.telematicsId, then trucks.truckNumber. */
  vehicleId?: string;
  point: LngLat;
  speedKmh?: number | null;
  heading?: number | null;
  recordedAt?: Date;
}

/** Position as stored and broadcast to clients. */
export interface TruckPosition {
  truckId: string;
  point: LngLat;
  speedKmh: number | null;
  heading: number | null;
  recordedAt: string;
}

export type PositionSink = (fixes: PositionFix[]) => Promise<unknown>;

/**
 * A source of positions that pushes into the app (polling a provider API, a device
 * gateway, or the simulator). Webhook-based providers post to /telematics/webhook instead.
 */
export abstract class TelematicsProvider {
  abstract readonly name: string;
  abstract start(sink: PositionSink): void | Promise<void>;
  abstract stop(): void | Promise<void>;
}
