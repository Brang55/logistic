import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserRole } from "../db/schema";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
