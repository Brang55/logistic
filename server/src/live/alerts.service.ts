import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { LiveAlert, LiveGateway } from "./live.gateway";

const KEEP = 100;

/**
 * Recent alerts for dispatchers, pushed live and kept in memory for screens that open later.
 * (In memory per API instance; move to a table once alerts need history.)
 */
@Injectable()
export class AlertsService {
  private readonly recent: LiveAlert[] = [];

  constructor(private readonly live: LiveGateway) {}

  raise(alert: Omit<LiveAlert, "id" | "createdAt">): LiveAlert {
    const full: LiveAlert = { ...alert, id: randomUUID(), createdAt: new Date().toISOString() };
    this.recent.unshift(full);
    this.recent.length = Math.min(this.recent.length, KEEP);
    this.live.alert(full);
    return full;
  }

  list(): LiveAlert[] {
    return [...this.recent];
  }
}
