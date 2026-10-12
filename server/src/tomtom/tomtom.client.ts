import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const API_URL = "https://api.tomtom.com";
// Error codes TomTom puts in the error message; matched as substrings, as its docs advise.
const KNOWN_CODES = ["NO_ROUTE_FOUND", "MAP_MATCHING_FAILURE"];

export class TomTomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

type QueryValue = string | string[] | undefined;

interface ErrorBody {
  detailedError?: { code?: string; message?: string; innerError?: { code?: string } };
  error?: { description?: string };
  formatVersion?: string;
}

// Thin wrapper over the TomTom REST APIs. The key never leaves the server.
@Injectable()
export class TomTomClient {
  private readonly logger = new Logger(TomTomClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return !!this.config.get<string>("TOMTOM_API_KEY");
  }

  get<T>(path: string, params: Record<string, QueryValue>): Promise<T> {
    return this.request<T>(path, params);
  }

  post<T>(path: string, body: unknown, params: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>(path, params, body);
  }

  private async request<T>(path: string, params: Record<string, QueryValue>, body?: unknown): Promise<T> {
    const key = this.config.get<string>("TOMTOM_API_KEY");
    if (!key) throw new ServiceUnavailableException("TOMTOM_API_KEY is not configured");

    const query = new URLSearchParams({ key });
    for (const [name, value] of Object.entries(params)) {
      // Repeated parameters (e.g. sectionType) are sent once per value.
      for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) query.append(name, item);
    }

    const response = await fetch(`${API_URL}${path}?${query}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => ({}))) as ErrorBody;
    if (!response.ok) {
      const message = json.detailedError?.message ?? json.error?.description ?? `TomTom request failed (${response.status})`;
      const code =
        json.detailedError?.innerError?.code ??
        KNOWN_CODES.find((known) => message.includes(known)) ??
        json.detailedError?.code;
      this.logger.warn(`TomTom ${path.split("/").slice(0, 4).join("/")} failed: ${response.status} ${message}`);
      throw new TomTomApiError(response.status, code, message);
    }
    return json as T;
  }
}
