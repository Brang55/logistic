// The API and database are metric (the routing engines need metric); the app shows US units.
const MILE_M = 1609.344;
const FOOT_M = 0.3048;
const INCH_M = 0.0254;
const POUND_KG = 0.45359237;

export const kmToMiles = (km: number) => (km * 1000) / MILE_M;
export const milesToKm = (miles: number) => (miles * MILE_M) / 1000;
export const mToFt = (m: number) => m / FOOT_M;
export const ftToM = (ft: number) => ft * FOOT_M;
export const kgToLb = (kg: number) => kg / POUND_KG;
export const lbToKg = (lb: number) => lb * POUND_KG;
/** Metric tons (how truck weights are stored) to pounds and back. */
export const tToLb = (t: number) => kgToLb(t * 1000);
export const lbToT = (lb: number) => lbToKg(lb) / 1000;

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/** "850 ft", "12.4 mi", "1,245 mi". */
export const formatDistance = (meters: number) => {
  const miles = meters / MILE_M;
  if (miles < 0.1) return `${whole(meters / FOOT_M)} ft`;
  return miles < 100 ? `${miles.toFixed(1)} mi` : `${whole(miles)} mi`;
};

/** Odometer readings and service intervals: "112,450 mi". */
export const formatMiles = (km: number) => `${whole(kmToMiles(km))} mi`;

export const formatSpeed = (kmh: number) => `${Math.round(kmh / 1.609344)} mph`;

/** "40,000 lb". */
export const formatWeight = (kg: number) => `${whole(kgToLb(kg))} lb`;

/** Truck dimensions: 4.11 m is 13′ 6″. */
export const formatLength = (m: number) => {
  const inches = Math.round(m / INCH_M);
  const feet = Math.floor(inches / 12);
  return inches % 12 ? `${feet}′ ${inches % 12}″` : `${feet}′`;
};

/** For number inputs: a converted value with sensible precision, or "" when unset. */
export const toInputValue = (value: number | null | undefined, convert: (n: number) => number, decimals = 0) =>
  value == null ? "" : String(Number(convert(value).toFixed(decimals)));

/** Cargo weight is free text holding kg: numbers become "40,000 lb", anything else shows as entered. */
export const formatCargoWeight = (weight: string) => {
  const kg = Number(weight);
  return Number.isFinite(kg) && weight.trim() !== "" ? formatWeight(kg) : weight;
};
