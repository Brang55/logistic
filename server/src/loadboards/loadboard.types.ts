import { LngLat } from "../routing/routing.types";

export interface LoadStop {
  city: string;
  /** Street address of the dock. */
  address: string;
  point: LngLat;
}

export interface LoadContact {
  name: string;
  contact: string;
  phone: string;
  email: string;
}

/** A load as offered on a freight exchange, normalised across boards. */
export interface ExternalLoad {
  id: string;
  board: string;
  region: "EU" | "US";
  origin: LoadStop;
  destination: LoadStop;
  pickupDate: string;
  deliveryDate: string;
  equipment: "Dry van" | "Reefer" | "Flatbed" | "Curtainsider" | "Tanker";
  weightKg: number;
  distanceKm: number;
  rate: { amount: number; currency: "EUR" | "USD" };
  commodity: string;
  hazmat: boolean;
  shipper: LoadContact;
  receiver: LoadContact;
  /** Booked by our company on the board; such loads are imported automatically. */
  bookedByUs: boolean;
}

/**
 * A freight exchange (DAT, Truckstop, Timocom, Trans.eu, ...). Real adapters need the
 * board's API credentials and a commercial agreement; the mock boards stand in for demos.
 */
export abstract class LoadBoardProvider {
  abstract readonly name: string;
  abstract readonly region: "EU" | "US";
  abstract search(): Promise<ExternalLoad[]>;
  abstract get(id: string): Promise<ExternalLoad | undefined>;
  /** Loads our company has booked, to be imported as cargo. */
  abstract bookedLoads(): Promise<ExternalLoad[]>;
}

export const LOAD_BOARD_PROVIDERS = Symbol("LOAD_BOARD_PROVIDERS");
