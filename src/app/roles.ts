import type { UserRole } from "./features/driver/authSlice";

export const STAFF: UserRole[] = ["admin", "dispatcher"];

/** Where each role lands after login, or when opening a page meant for another role. */
export const homeFor = (role: UserRole) => (role === "driver" ? "/driver" : "/");
