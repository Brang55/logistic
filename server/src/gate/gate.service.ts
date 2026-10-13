import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { secretsEqual } from "../common/secrets";

/**
 * The site password asked before the app loads (production only). Caddy serves the app only to requests
 * carrying the cookie `site_gate=<SITE_GATE_TOKEN>`, which this service hands out for the right password.
 */
@Injectable()
export class GateService {
  constructor(private readonly config: ConfigService) {}

  /** The cookie value, or null when no gate is configured (development and tests). */
  token(): string | null {
    const password = this.config.get<string>("SITE_GATE_PASSWORD");
    const token = this.config.get<string>("SITE_GATE_TOKEN");
    return password && token ? token : null;
  }

  check(password: string) {
    const expected = this.config.get<string>("SITE_GATE_PASSWORD");
    return !!expected && secretsEqual(expected, password);
  }
}
