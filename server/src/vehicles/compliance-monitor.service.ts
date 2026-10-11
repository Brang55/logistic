import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertsService } from "../live/alerts.service";
import { WARN_DAYS, WARN_KM } from "./record-status";
import { AttentionItem, VehicleRecordsService } from "./vehicle-records.service";

const LABELS = {
  expired: "has expired",
  expiring: "expires soon",
  overdue: "is overdue",
  due_soon: "is due soon",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Only the limits that triggered the alert: a check overdue by km may still be months away by date.
function dueDetail({ daysLeft, kmLeft }: AttentionItem) {
  const parts: string[] = [];
  if (daysLeft !== null && daysLeft <= WARN_DAYS) {
    parts.push(daysLeft === 0 ? "today" : daysLeft < 0 ? `${plural(-daysLeft, "day")} ago` : `in ${plural(daysLeft, "day")}`);
  }
  if (kmLeft !== null && kmLeft <= WARN_KM) {
    // Stored in km; the US fleet thinks in miles.
    const miles = (km: number) => Math.round(km / 1.609344).toLocaleString("en-US");
    parts.push(kmLeft < 0 ? `${miles(-kmLeft)} mi over` : `${miles(kmLeft)} mi left`);
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Periodically raises an alert, once per state, for documents and checks that need attention. */
@Injectable()
export class ComplianceMonitor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ComplianceMonitor.name);
  private readonly alerted = new Set<string>();
  private readonly intervalMs: number;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly records: VehicleRecordsService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get("COMPLIANCE_CHECK_INTERVAL_MS") ?? 6 * 60 * 60_000);
  }

  onApplicationBootstrap() {
    if (this.intervalMs <= 0) return;
    const run = () => void this.check().catch((err) => this.logger.warn(`Compliance check failed: ${err.message}`));
    this.timers = [setTimeout(run, 5000), setInterval(run, this.intervalMs)];
  }

  onApplicationShutdown() {
    this.timers.forEach((timer) => clearTimeout(timer));
  }

  async check() {
    for (const item of await this.records.attention()) {
      const key = `${item.recordId}:${item.status}`;
      if (this.alerted.has(key)) continue;
      this.alerted.add(key);
      this.alerts.raise({
        kind: "compliance",
        severity: item.status === "expired" || item.status === "overdue" ? "critical" : "warning",
        message: `${item.vehicleLabel}: ${item.title} ${LABELS[item.status]}${dueDetail(item)}`,
      });
    }
  }
}
