import type Cargo from "../app/api/cargos";
import type { Driver } from "../app/api/drivers";
import type { LngLat } from "../app/api/routing";
import type { TruckPosition } from "../app/api/telematics";
import type { TruckOrigin } from "../app/api/trips";
import type { Truck } from "../app/api/trucks";
import { distanceKm } from "./geo";
import { isFinished } from "./status";

/**
 * The truck, driver and trailer picked for a load, as form values ("" for none). `driverId` is ""
 * for the truck's own (seated) driver, or a relief driver who drives only this load.
 */
export interface Crew {
  truckId: string;
  driverId: string;
  trailerId: string;
}

type Assigned = Pick<Cargo, "truckId" | "driverId" | "trailerId">;

export const fullName = (driver: Pick<Driver, "firstName" | "lastName">) => `${driver.firstName} ${driver.lastName}`;

/** The crew a load has now. Its driver counts as a relief driver only when it isn't the truck's own. */
export const crewOf = (cargo: Assigned | undefined, trucks: Truck[] = []): Crew => {
  const truck = trucks.find((item) => item.id === cargo?.truckId);
  return {
    truckId: cargo?.truckId ?? "",
    driverId: cargo?.driverId && cargo.driverId !== truck?.driverId ? cargo.driverId : "",
    trailerId: cargo?.trailerId ?? "",
  };
};

/**
 * Picking a truck brings its own driver and, when one is hooked up, its trailer. A trailer that
 * only came with the previous truck doesn't stay; one picked for the load does.
 */
export const withTruck = (crew: Crew, truck?: Truck, previous?: Truck): Crew => ({
  truckId: truck?.id ?? "",
  driverId: "",
  trailerId: truck?.trailerId || (crew.trailerId === previous?.trailerId ? "" : crew.trailerId),
});

export interface TruckChoice {
  truck: Truck;
  /** Straight-line distance to the pickup from where the truck will be free. */
  km?: number;
  /** The distance is measured from the delivery of the truck's other loads. */
  afterLoads: boolean;
}

/**
 * Trucks closest to the pickup first, measured from where each will be free: after its other
 * loads, else from where it is now. Trucks with no known position come last.
 */
export function rankTrucks(
  trucks: Truck[],
  pickup?: LngLat,
  positions: TruckPosition[] = [],
  origins: TruckOrigin[] = [],
): TruckChoice[] {
  const now = new Map(positions.map((position) => [position.truckId, position.point]));
  const later = new Map(origins.map((origin) => [origin.truckId, origin.point]));
  return trucks
    .map((truck) => {
      const from = later.get(truck.id) ?? now.get(truck.id);
      return { truck, afterLoads: later.has(truck.id), km: pickup && from ? distanceKm(from, pickup) : undefined };
    })
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.truck.truckNumber.localeCompare(b.truck.truckNumber));
}

export interface SeatingEffects {
  /** Unfinished loads on the new truck that move from its previous driver to this one. */
  gained: Cargo[];
  /** Unfinished loads this driver had on their previous truck, which are left without a driver. */
  left: Cargo[];
  /** The driver seated in the new truck until now, who no longer has a truck. */
  replacedDriverId: string | null;
}

/** What seating a driver in a truck (or in none, with "") does, mirroring the API: loads follow their truck. */
export function seatingEffects(
  driver: Pick<Driver, "id" | "truckId"> | undefined,
  truckId: string,
  trucks: Truck[],
  cargos: Cargo[],
): SeatingEffects {
  const from = driver?.truckId ?? "";
  if (from === truckId) return { gained: [], left: [], replacedDriverId: null };
  const unfinished = cargos.filter((cargo) => !isFinished(cargo.status));
  const replacedDriverId = trucks.find((truck) => truck.id === truckId)?.driverId ?? null;
  return {
    gained: truckId ? unfinished.filter((c) => c.truckId === truckId && (c.driverId ?? null) === replacedDriverId) : [],
    left: driver && from ? unfinished.filter((c) => c.truckId === from && c.driverId === driver.id) : [],
    replacedDriverId,
  };
}
