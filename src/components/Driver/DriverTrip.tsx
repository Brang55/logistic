import { ReactNode, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBoxesStacked,
  faCircleCheck,
  faClock,
  faFlagCheckered,
  faHourglassHalf,
  faListOl,
  faPhone,
  faRoad,
  faTrailer,
  faTriangleExclamation,
  faTruck,
  faTruckFast,
  faWarehouse,
} from "@fortawesome/free-solid-svg-icons";

import type Cargo from "../../app/features/driver/cargoSlice";
import {
  useMarkDeliveredMutation,
  useMarkPickedUpMutation,
  useMyTripQuery,
  type MyTrip,
} from "../../app/features/driver/tripsSlice";
import { formatAge, formatDistance, formatDuration } from "../../utils/format";
import { distanceKm } from "../../utils/geo";
import { groupMessages } from "../../utils/notices";
import { Loader } from "../Loader/Loader";
import { Badge, Modal, PageHeader } from "../ui/ui";
import { cx, shipmentRef } from "../ui/helpers";
import { useRoadReportsQuery } from "../../app/features/driver/communitySlice";
import DelayDialog from "./DelayDialog";
import { errorMessage, formatClock, formatDay, formatWeight, greeting } from "./driverFormat";
import QuickReports from "./QuickReports";
import StopConfirmDialog from "./StopConfirmDialog";
import { Toast } from "./Toast";
import { useToast } from "./useToast";
import TripMap from "./TripMap";
import VoiceAssistant from "./VoiceAssistant";

import styles from "./DriverTrip.module.css";

const REFRESH_MS = 15_000;
// Within this straight-line distance the truck counts as arrived at the stop.
const ARRIVED_KM = 1;

type Trip = NonNullable<MyTrip["trip"]>;


const Header = ({ firstName, trip }: { firstName: string; trip?: Trip | null }) => (
  <PageHeader
    eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
    title={`${greeting()}, ${firstName}`}
    actions={
      trip && (
        <div className={styles.equipment}>
          <span className={styles.equipmentChip}>
            <FontAwesomeIcon icon={faTruck} />
            {trip.truck.truckNumber}
            {trip.truck.plate && <span>{trip.truck.plate}</span>}
          </span>
          {trip.trailer && (
            <span className={styles.equipmentChip}>
              <FontAwesomeIcon icon={faTrailer} />
              {trip.trailer.trailerNumber}
              {trip.trailer.trailer && <span>{trip.trailer.trailer}</span>}
            </span>
          )}
        </div>
      )
    }
  />
);

/** Pickup → delivery with what's done and what's next. */
const Journey = ({ cargo, etaAt }: { cargo: Cargo; etaAt?: Date }) => {
  const pickedUp = Boolean(cargo.pickedUpAt);
  return (
    <ol className={styles.journey}>
      <li className={cx(styles.journeyStop, pickedUp ? styles.journeyDone : styles.journeyCurrent)}>
        <span className={styles.journeyDot}>{pickedUp ? <FontAwesomeIcon icon={faCircleCheck} /> : "A"}</span>
        <span className={styles.journeyText}>
          <span className={styles.journeyLabel}>Pickup</span>
          <strong>{cargo.pickupLocation}</strong>
          <span className={styles.journeyMeta}>
            {pickedUp
              ? `Loaded ${formatDay(cargo.pickedUpAt)} at ${formatClock(cargo.pickedUpAt!)}`
              : `Planned ${formatDay(cargo.pickupDate)}${etaAt ? ` · ETA ${formatClock(etaAt)}` : ""}`}
          </span>
        </span>
      </li>
      <li className={cx(styles.journeyStop, pickedUp ? styles.journeyCurrent : styles.journeyUpcoming)}>
        <span className={styles.journeyDot}>B</span>
        <span className={styles.journeyText}>
          <span className={styles.journeyLabel}>Delivery</span>
          <strong>{cargo.deliveryLocation}</strong>
          <span className={styles.journeyMeta}>
            Planned {formatDay(cargo.deliveryDate)}
            {pickedUp && etaAt ? ` · ETA ${formatClock(etaAt)}` : ""}
          </span>
        </span>
      </li>
    </ol>
  );
};

const Metric = ({ icon, label, value }: { icon: IconDefinition; label: string; value: string }) => (
  <div className={styles.metric}>
    <FontAwesomeIcon icon={icon} className={styles.metricIcon} />
    <span className={styles.metricValue}>{value}</span>
    <span className={styles.metricLabel}>{label}</span>
  </div>
);

const Detail = ({ label, children }: { label: string; children: ReactNode }) =>
  children ? (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  ) : null;

const Party = ({ title, name, address, contact, phone }: Record<string, string | undefined>) => (
  <div className={styles.party}>
    <span className={styles.partyTitle}>{title}</span>
    <strong>{name || "–"}</strong>
    {address && <span className={styles.muted}>{address}</span>}
    {(contact || phone) && (
      <span className={styles.partyContact}>
        {contact}
        {phone && (
          <a href={`tel:${phone}`} className={styles.inlineCall}>
            <FontAwesomeIcon icon={faPhone} /> {phone}
          </a>
        )}
      </span>
    )}
  </div>
);

const CargoDetails = ({ cargo }: { cargo: Cargo }) => (
  <section className={styles.card}>
    <div className={styles.cardHeader}>
      <h2>
        <FontAwesomeIcon icon={faBoxesStacked} /> Cargo
      </h2>
      <span className={styles.ref}>{shipmentRef(cargo.id)}</span>
    </div>
    <dl className={styles.details}>
      <Detail label="Goods">{cargo.descriptionOfGoods}</Detail>
      <Detail label="Quantity">{cargo.quantity}</Detail>
      <Detail label="Weight">{cargo.weight && formatWeight(cargo.weight)}</Detail>
      <Detail label="Dimensions">{cargo.dimensions}</Detail>
      <Detail label="Temperature">{cargo.temperatureControl}</Detail>
      <Detail label="Hazardous">{cargo.hazardousMaterial}</Detail>
    </dl>
    {cargo.specialHandlingInstructions && (
      <div className={styles.instructions}>
        <strong>Handling instructions</strong>
        <p>{cargo.specialHandlingInstructions}</p>
      </div>
    )}
    {cargo.notes && (
      <div className={styles.instructions}>
        <strong>Notes from dispatch</strong>
        <p>{cargo.notes}</p>
      </div>
    )}
    <div className={styles.parties}>
      <Party
        title="Shipper"
        name={cargo.shipperName}
        address={cargo.shipperAddress}
        contact={cargo.contactPerson}
        phone={cargo.phoneNumber}
      />
      <Party
        title="Receiver"
        name={cargo.receiverName}
        address={cargo.receiverAddress}
        contact={cargo.receiverContact}
        phone={cargo.receiverPhone}
      />
    </div>
  </section>
);

const DriverTrip = () => {
  const { data, isLoading, error } = useMyTripQuery(undefined, { pollingInterval: REFRESH_MS });
  const [markPickedUp, pickup] = useMarkPickedUpMutation();
  const [markDelivered, delivery] = useMarkDeliveredMutation();
  const [confirming, setConfirming] = useState(false);
  const [reportingDelay, setReportingDelay] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  const { toast, show: showToast, dismiss: dismissToast } = useToast();
  const { data: roadReports } = useRoadReportsQuery();

  if (isLoading) return <Loader />;
  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={cx(styles.card, styles.emptyCard)}>
          <FontAwesomeIcon icon={faTriangleExclamation} className={styles.emptyIcon} />
          <h2>Could not load your trip</h2>
          <p className={styles.muted}>{errorMessage(error)}</p>
        </div>
      </div>
    );
  }

  const { driver, trip } = data;
  const toastView = <Toast toast={toast} onDismiss={dismissToast} />;

  if (!trip) {
    return (
      <div className={styles.page}>
        <Header firstName={driver.firstName} />
        <div className={cx(styles.card, styles.emptyCard)}>
          <span className={styles.emptyBadge}>
            <FontAwesomeIcon icon={faTruckFast} />
          </span>
          <h2>No active load</h2>
          <p className={styles.muted}>
            You're all done for now. When your dispatcher assigns your next load, it appears here with the route and
            stop details.
          </p>
        </div>
        <div className={styles.emptyExtras}>
          <QuickReports onToast={showToast} />
        </div>
        {toastView}
      </div>
    );
  }

  const { cargo, nextStop, route } = trip;
  const isPickup = nextStop.kind === "pickup";
  // The first leg runs from the truck to the next stop when the position is known.
  const toNextStop = trip.position ? route?.legs[0] : undefined;
  const etaAt = toNextStop ? new Date(Date.now() + toNextStop.durationS * 1000) : undefined;
  const straightKm = trip.position ? distanceKm(trip.position.point, nextStop.point) : undefined;
  const arrived = straightKm !== undefined && straightKm < ARRIVED_KM;
  const contact = isPickup
    ? { name: cargo.contactPerson || cargo.shipperName, company: cargo.shipperName, address: cargo.shipperAddress, phone: cargo.phoneNumber }
    : { name: cargo.receiverContact || cargo.receiverName, company: cargo.receiverName, address: cargo.receiverAddress, phone: cargo.receiverPhone };
  const violations = groupMessages((route?.notices ?? []).filter((n) => n.type === "violation").map((n) => n.message));
  const confirmError = pickup.error ?? delivery.error;

  const confirmStop = async () => {
    const result = isPickup ? await markPickedUp(cargo.id) : await markDelivered(cargo.id);
    if ("error" in result) return;
    setConfirming(false);
    showToast(isPickup ? `Pickup confirmed. Next stop: ${cargo.deliveryLocation}.` : "Delivery confirmed. Well done!");
  };

  return (
    <div className={styles.page}>
      <Header firstName={driver.firstName} trip={trip} />

      <div className={styles.tripLayout}>
        <div className={styles.column}>
          <section className={cx(styles.card, styles.hero, styles.orderHero, isPickup ? styles.heroPickup : styles.heroDelivery)}>
            <div className={styles.heroTop}>
              <span className={cx(styles.stopIcon, isPickup ? styles.stopIconPickup : styles.stopIconDelivery)}>
                <FontAwesomeIcon icon={isPickup ? faWarehouse : faFlagCheckered} />
              </span>
              <div className={styles.heroTitle}>
                <div className={styles.kickerRow}>
                  <span className={styles.kicker}>Next stop · {isPickup ? "Pickup" : "Delivery"}</span>
                  <Badge tone={isPickup ? "success" : "primary"}>{isPickup ? "Heading to pickup" : "In transit"}</Badge>
                </div>
                <h2>{nextStop.name}</h2>
                {contact.address && contact.address !== nextStop.name && <p className={styles.muted}>{contact.address}</p>}
              </div>
            </div>

            {arrived ? (
              <div className={styles.arrived}>
                <FontAwesomeIcon icon={faCircleCheck} />
                <span>
                  <strong>You have arrived.</strong>{" "}
                  {isPickup ? "Confirm once the goods are loaded." : "Confirm once the goods are unloaded and signed for."}
                </span>
              </div>
            ) : (
              toNextStop && (
                <div className={styles.metrics}>
                  <Metric icon={faRoad} label="Distance" value={formatDistance(toNextStop.distanceM)} />
                  <Metric icon={faHourglassHalf} label="Drive time" value={formatDuration(toNextStop.durationS)} />
                  <Metric icon={faClock} label="Arrival" value={etaAt ? formatClock(etaAt) : "–"} />
                </div>
              )
            )}

            {(contact.name || contact.phone) && (
              <div className={styles.contact}>
                <span className={styles.avatar}>{(contact.name || "?").slice(0, 1).toUpperCase()}</span>
                <span className={styles.contactText}>
                  <strong>{contact.name}</strong>
                  <span className={styles.muted}>{isPickup ? "Pickup contact" : "Receiver contact"}</span>
                </span>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className={styles.callButton} aria-label={`Call ${contact.name}`}>
                    <FontAwesomeIcon icon={faPhone} />
                    <span>Call</span>
                  </a>
                )}
              </div>
            )}

            <button className={styles.confirmButton} onClick={() => setConfirming(true)}>
              <FontAwesomeIcon icon={faCircleCheck} />
              {isPickup ? "Confirm pickup" : "Confirm delivery"}
            </button>
            <div className={styles.secondaryActions}>
              <button className={styles.ghostButton} onClick={() => setReportingDelay(true)}>
                <FontAwesomeIcon icon={faClock} /> Report delay
              </button>
              <button className={styles.ghostButton} onClick={() => setShowDirections(true)} disabled={!route?.steps.length}>
                <FontAwesomeIcon icon={faListOl} /> Directions
              </button>
            </div>
            {cargo.delayMinutes ? (
              <p className={styles.delayNote}>
                Delay reported: {cargo.delayMinutes} min{cargo.delayReason && ` · ${cargo.delayReason}`}
              </p>
            ) : null}
          </section>

          <section className={cx(styles.card, styles.orderTrip)}>
            <div className={styles.cardHeader}>
              <h2>
                <FontAwesomeIcon icon={faRoad} /> Trip
              </h2>
              {trip.position && <span className={styles.live}>Live · {formatAge(trip.position.recordedAt)}</span>}
            </div>
            <Journey cargo={cargo} etaAt={etaAt} />
          </section>

          <div className={styles.orderReports}>
            <QuickReports onToast={showToast} />
          </div>

          <div className={styles.orderVoice}>
            <VoiceAssistant />
          </div>
        </div>

        <div className={styles.column}>
          <div className={cx(styles.tripMap, styles.orderMap)}>
            <TripMap trip={trip} reports={roadReports?.reports} />
          </div>

          {violations.length > 0 && (
            // Open by default: the driver must not miss these before driving the route.
            <details open className={cx(styles.card, styles.warningCard, styles.orderWarnings)}>
              <summary>
                <FontAwesomeIcon icon={faTriangleExclamation} />
                {violations.length} truck restriction{violations.length === 1 ? "" : "s"} on this route
              </summary>
              <ul>
                {violations.map(({ message, count }) => (
                  <li key={message}>
                    {message}
                    {count > 1 && ` (${count} places)`}
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>
                {cargo.restrictionsAcceptedTruckId === trip.truck.id
                  ? "Dispatch approved this route despite these restrictions. Confirm permits or the final approach with your dispatcher."
                  : "Check with your dispatcher before driving these sections."}
              </p>
            </details>
          )}

          <div className={styles.orderCargo}>
            <CargoDetails cargo={cargo} />
          </div>

          {trip.queue.length > 0 && (
            <section className={cx(styles.card, styles.orderQueue)}>
              <div className={styles.cardHeader}>
                <h2>
                  <FontAwesomeIcon icon={faTruckFast} /> Up next
                </h2>
                <span className={styles.ref}>{trip.queue.length} queued</span>
              </div>
              <ul className={styles.queue}>
                {trip.queue.map((next) => (
                  <li key={next.id}>
                    <strong>
                      {next.pickupLocation} → {next.deliveryLocation}
                    </strong>
                    <span className={styles.muted}>
                      Pickup {formatDay(next.pickupDate)} · {next.descriptionOfGoods}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {confirming && (
        <StopConfirmDialog
          stop={nextStop}
          cargo={cargo}
          distanceKm={straightKm}
          busy={pickup.isLoading || delivery.isLoading}
          error={confirmError ? errorMessage(confirmError) : undefined}
          onConfirm={confirmStop}
          onCancel={() => setConfirming(false)}
        />
      )}
      {reportingDelay && <DelayDialog cargoId={cargo.id} onClose={() => setReportingDelay(false)} onSent={showToast} />}
      {showDirections && route && (
        <Modal title="Turn-by-turn directions" onClose={() => setShowDirections(false)}>
          <ol className={styles.steps}>
            {route.steps.map((step, index) => (
              <li key={index}>
                <span>{step.instruction}</span>
                <span className={styles.muted}>{formatDistance(step.distanceM)}</span>
              </li>
            ))}
          </ol>
        </Modal>
      )}
      {toastView}
    </div>
  );
};

export default DriverTrip;
