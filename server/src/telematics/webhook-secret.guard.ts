import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { secretsEqual } from "../common/secrets";

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
    if (!secret || typeof given !== "string" || !secretsEqual(secret, given)) {
      throw new UnauthorizedException("Invalid telematics secret");
    }
    return true;
  }
}
