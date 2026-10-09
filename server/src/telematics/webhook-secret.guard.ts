import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Shared-secret check for telematics webhooks (header "x-telematics-secret").
 * Real providers sign payloads differently; their adapters can replace this guard.
 */
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const secret = this.config.get<string>("TELEMATICS_WEBHOOK_SECRET");
    const given = context.switchToHttp().getRequest().headers["x-telematics-secret"];
    // Hashing first makes the comparison constant-time regardless of length.
    if (!secret || typeof given !== "string" || !timingSafeEqual(digest(secret), digest(given))) {
      throw new UnauthorizedException("Invalid telematics secret");
    }
    return true;
  }
}
