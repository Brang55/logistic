import type { AttentionItem, MaintenanceItem, VehicleDocument } from "../../app/api/vehicleRecords";
import { Badge } from "../ui/ui";
import { relativeDays } from "./recordFormat";

export const DocumentStatus = ({ doc }: { doc: Pick<VehicleDocument, "status" | "daysLeft"> }) => {
  switch (doc.status) {
    case "expired":
      return <Badge tone="danger">Expired {relativeDays(doc.daysLeft ?? 0)}</Badge>;
    case "expiring":
      return <Badge tone="warning">Expires {relativeDays(doc.daysLeft ?? 0)}</Badge>;
    case "valid":
      return <Badge tone="success">Valid</Badge>;
    default:
      return <Badge>No expiry</Badge>;
  }
};

export const MaintenanceStatus = ({ item }: { item: Pick<MaintenanceItem, "status"> }) => {
  switch (item.status) {
    case "overdue":
      return <Badge tone="danger">Overdue</Badge>;
    case "due_soon":
      return <Badge tone="warning">Due soon</Badge>;
    case "ok":
      return <Badge tone="success">OK</Badge>;
    default:
      return <Badge>Not recorded</Badge>;
  }
};

/** One-line summary of a vehicle's open issues, e.g. "1 expired · 2 due soon". */
export const AttentionSummary = ({ items }: { items: AttentionItem[] }) => {
  if (!items.length) return <Badge tone="success">All good</Badge>;
  const expired = items.filter((item) => item.status === "expired").length;
  const overdue = items.filter((item) => item.status === "overdue").length;
  const soon = items.length - expired - overdue;
  const text = [expired && `${expired} expired`, overdue && `${overdue} overdue`, soon && `${soon} due soon`]
    .filter(Boolean)
    .join(" · ");
  return <Badge tone={expired || overdue ? "danger" : "warning"}>{text}</Badge>;
};
