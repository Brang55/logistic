import { BadRequestException } from "@nestjs/common";
import { ToolInput } from "../assistant.types";

// The database is metric; everything the assistant reads or says is in US units.
const MILE_M = 1609.344;
const POUND_KG = 0.45359237;
const FOOT_M = 0.3048;

export const miles = (meters: number) => Math.round(meters / MILE_M);
export const lbToKg = (lb: number) => lb * POUND_KG;
export const pounds = (kg: number) => Math.round(kg / POUND_KG);
export const feet = (m: number) => Math.round((m / FOOT_M) * 10) / 10;

/** Cargo weight is free text holding kg: numbers become pounds, anything else stays as entered. */
export const cargoWeightLb = (weight: string) => {
  const kg = Number(weight);
  return weight.trim() !== "" && Number.isFinite(kg) ? pounds(kg) : weight || null;
};

/** The reference dispatchers see in the web app. */
export const shipmentRef = (id: string) => `SH-${id.slice(0, 6).toUpperCase()}`;

/** "" and missing values become null, so Claude isn't shown empty fields. */
export const orNull = (text: string | null | undefined) => (text ? text : null);

/** Every word of `text` appears somewhere in `fields` (case-insensitive). */
export const matchesAll = (text: string | undefined, ...fields: (string | null | undefined)[]) => {
  if (!text?.trim()) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return text.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};

// Tool inputs come from the model: check each field before it reaches a service.

export const optionalText = (input: ToolInput, key: string): string | undefined => {
  const value = input[key];
  if (value == null) return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${key} must be text`);
  return value.trim() || undefined;
};

export const requiredText = (input: ToolInput, key: string): string => {
  const value = optionalText(input, key);
  if (!value) throw new BadRequestException(`${key} is required`);
  return value;
};

export const optionalNumber = (input: ToolInput, key: string): number | undefined => {
  const value = input[key];
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${key} must be a positive number`);
  }
  return value;
};

export const optionalDay = (input: ToolInput, key: string): string | undefined => {
  const value = optionalText(input, key);
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${key} must be a YYYY-MM-DD date`);
  }
  return value;
};

/** A reference that can be set (an id), cleared (null) or left alone (missing). */
export const optionalRef = (input: ToolInput, key: string): string | null | undefined => {
  if (!(key in input) || input[key] === undefined) return undefined;
  if (input[key] === null || input[key] === "") return null;
  return requiredId(input, key);
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requiredId = (input: ToolInput, key: string): string => {
  const value = requiredText(input, key);
  if (!UUID.test(value)) throw new BadRequestException(`${key} must be an id returned by a find_* tool`);
  return value;
};
