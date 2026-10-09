import { registerDecorator, ValidationOptions } from "class-validator";

export const isLngLat = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;

export function IsLngLat(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: "isLngLat",
      target: target.constructor,
      propertyName,
      options: { message: `${propertyName} must be [longitude, latitude]`, ...options },
      validator: { validate: isLngLat },
    });
}

/** Parses "lng,lat" query strings. */
export const parseLngLat = (value: string): [number, number] | undefined => {
  const parsed = value.split(",").map(Number);
  return isLngLat(parsed) ? parsed : undefined;
};
