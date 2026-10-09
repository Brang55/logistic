import { SetMetadata } from "@nestjs/common";
import { UserRole } from "../db/schema";

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Admins and dispatchers manage fleet and cargo data.
export const ManageFleet = () => Roles("admin", "dispatcher");
