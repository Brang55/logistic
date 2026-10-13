import type Cargo from "../app/api/cargos";
import type { Driver } from "../app/api/drivers";
import type { RoutePlan } from "../app/api/routing";
import type { Trailer } from "../app/api/trailers";
import type { Truck } from "../app/api/trucks";

/** Records as the API returns them, with only the fields a test cares about set. */
export const cargo = (fields: Partial<Cargo> & Pick<Cargo, "id">): Cargo => ({
  contactPerson: "",
  deliveryDate: "2026-10-16",
  deliveryLocation: "Atlanta, GA",
  descriptionOfGoods: "Paper rolls",
  dimensions: "",
  emailAddress: "",
  freightCost: "",
  hazardousMaterial: "",
  notes: "",
  paymentTerms: "",
  phoneNumber: "",
  pickupDate: "2026-10-14",
  pickupLocation: "Dallas, TX",
  quantity: "",
  receiverAddress: "",
  receiverContact: "",
  receiverEmail: "",
  receiverName: "",
  receiverPhone: "",
  serviceType: "",
  shipperAddress: "",
  shipperName: "Acme Paper",
  specialHandlingInstructions: "",
  temperatureControl: "",
  truckType: "Dry van",
  weight: "18000",
  status: "confirmed",
  pickupPoint: { x: -96.8, y: 32.78 },
  deliveryPoint: { x: -84.39, y: 33.75 },
  ...fields,
});

export const truck = (fields: Partial<Truck> & Pick<Truck, "id" | "truckNumber">): Truck => ({
  status: "available",
  truckModel: "Freightliner Cascadia",
  engineVariation: "DD15",
  ...fields,
});

export const driver = (fields: Partial<Driver> & Pick<Driver, "id" | "firstName" | "lastName">): Driver => ({
  phoneNumber: "",
  truckDriverEmail: "",
  truckId: null,
  truckNumber: null,
  content: "",
  status: "available",
  ...fields,
});

export const trailer = (fields: Partial<Trailer> & Pick<Trailer, "id" | "trailerNumber">): Trailer => ({
  trailer: "53 ft dry van",
  status: "available",
  ...fields,
});

export const routePlan = (fields: Partial<RoutePlan> = {}): RoutePlan => ({
  distanceM: 1_250_000,
  durationS: 42_000,
  summary: "I-20 E",
  geometry: { type: "LineString", coordinates: [] },
  legs: [],
  steps: [],
  notices: [],
  incidents: [],
  ...fields,
});
