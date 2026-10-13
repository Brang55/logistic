import { createHash, timingSafeEqual } from "crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compares a configured secret with a client-supplied value in constant time, whatever their lengths. */
export function secretsEqual(secret: string, given: string) {
  return timingSafeEqual(digest(secret), digest(given));
}
