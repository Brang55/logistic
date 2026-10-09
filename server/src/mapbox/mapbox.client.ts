import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const API_URL = "https://api.mapbox.com";

export class MapboxApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

// Thin wrapper over the Mapbox REST APIs. The token never leaves the server.
@Injectable()
export class MapboxClient {
  private readonly logger = new Logger(MapboxClient.name);

  constructor(private readonly config: ConfigService) {}

  async get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const token = this.config.get<string>("MAPBOX_SECRET_TOKEN");
    if (!token) throw new ServiceUnavailableException("MAPBOX_SECRET_TOKEN is not configured");

    const query = new URLSearchParams({ access_token: token });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, value);
    }

    const response = await fetch(`${API_URL}${path}?${query}`, { signal: AbortSignal.timeout(10_000) });
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    if (!response.ok) {
      this.logger.warn(`Mapbox ${path.split("/").slice(0, 4).join("/")} failed: ${response.status} ${body.message ?? ""}`);
      throw new MapboxApiError(response.status, body.code, body.message ?? `Mapbox request failed (${response.status})`);
    }
    return body as T;
  }
}
