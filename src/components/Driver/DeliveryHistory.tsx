import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBoxOpen, faClockRotateLeft, faTruck } from "@fortawesome/free-solid-svg-icons";

import { useDeliveryHistoryQuery, type DeliveryHistory as History } from "../../app/api/community";
import { formatDuration } from "../../utils/format";
import { Loader } from "../Loader/Loader";
import { Badge, PageHeader } from "../ui/ui";
import { cx, shipmentRef } from "../ui/helpers";
import { formatClock, formatDay, formatWeight } from "./driverFormat";

import styles from "./DriverTrip.module.css";

type Delivery = History["deliveries"][number];

const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** Delivered on or before the planned delivery date. */
const onTime = (delivery: Delivery) => !!delivery.deliveredAt && localDay(delivery.deliveredAt) <= delivery.deliveryDate;

const startOfWeek = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
};

const monthLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const Stat = ({ value, label }: { value: string | number; label: string }) => (
  <div className={styles.metric}>
    <span className={styles.metricValue}>{value}</span>
    <span className={styles.metricLabel}>{label}</span>
  </div>
);

const DeliveryHistory = () => {
  const { data, isLoading } = useDeliveryHistoryQuery();

  if (isLoading) return <Loader />;
  const deliveries = (data?.deliveries ?? []).filter((d) => d.deliveredAt);
  const now = new Date();
  const weekStart = startOfWeek();
  const thisMonth = deliveries.filter((d) => {
    const at = new Date(d.deliveredAt!);
    return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
  }).length;
  const thisWeek = deliveries.filter((d) => new Date(d.deliveredAt!) >= weekStart).length;
  const onTimeShare = deliveries.length ? Math.round((deliveries.filter(onTime).length / deliveries.length) * 100) : 0;

  // Newest first, grouped by month.
  const months: { label: string; items: Delivery[] }[] = [];
  for (const delivery of deliveries) {
    const label = monthLabel(delivery.deliveredAt!);
    if (months[months.length - 1]?.label !== label) months.push({ label, items: [] });
    months[months.length - 1].items.push(delivery);
  }

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Driver" title="Delivery history" subtitle="Every load you have delivered, newest first" />

      <div className={cx(styles.card, styles.statsCard)}>
        <div className={styles.historyStats}>
          <Stat value={data?.total ?? 0} label="Deliveries in total" />
          <Stat value={thisMonth} label="This month" />
          <Stat value={thisWeek} label="This week" />
          <Stat value={deliveries.length ? `${onTimeShare}%` : "–"} label="On time" />
        </div>
      </div>

      {deliveries.length === 0 ? (
        <div className={cx(styles.card, styles.emptyCard)}>
          <span className={styles.emptyBadge}>
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </span>
          <h2>No deliveries yet</h2>
          <p className={styles.muted}>Loads you deliver appear here, with when they were delivered and whether they were on time.</p>
        </div>
      ) : (
        months.map((month) => (
          <section key={month.label} className={styles.historyMonth}>
            <h2 className={styles.monthTitle}>
              {month.label} <span>{month.items.length} deliveries</span>
            </h2>
            <ul className={styles.historyList}>
              {month.items.map((delivery) => {
                const duration =
                  delivery.pickedUpAt && delivery.deliveredAt
                    ? (new Date(delivery.deliveredAt).getTime() - new Date(delivery.pickedUpAt).getTime()) / 1000
                    : undefined;
                return (
                  <li key={delivery.id} className={styles.historyItem}>
                    <div className={styles.historyTop}>
                      <span className={styles.historyRoute}>
                        {delivery.pickupLocation}
                        <FontAwesomeIcon icon={faArrowRight} />
                        {delivery.deliveryLocation}
                      </span>
                      {onTime(delivery) ? <Badge tone="success">On time</Badge> : <Badge tone="warning">Late</Badge>}
                    </div>
                    <div className={styles.historyMeta}>
                      <span>
                        <FontAwesomeIcon icon={faBoxOpen} />
                        {[delivery.descriptionOfGoods, delivery.weight && formatWeight(delivery.weight)].filter(Boolean).join(" · ") ||
                          "Cargo"}
                      </span>
                      {delivery.truckNumber && (
                        <span>
                          <FontAwesomeIcon icon={faTruck} />
                          {delivery.truckNumber}
                        </span>
                      )}
                    </div>
                    <div className={styles.historyFoot}>
                      <span>
                        Delivered {formatDay(localDay(delivery.deliveredAt!))} at {formatClock(delivery.deliveredAt!)}
                        {duration !== undefined && duration > 0 && ` · ${formatDuration(duration)} on the road`}
                        {delivery.delayMinutes ? ` · ${formatDuration(delivery.delayMinutes * 60)} delay reported` : ""}
                      </span>
                      <span className={styles.ref}>{shipmentRef(delivery.id)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default DeliveryHistory;
