import { ReactNode } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faLocationDot,
  faPen,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { useLoadCargoQuery } from "../../../app/api/cargos";
import { useLoadDriverQuery } from "../../../app/api/drivers";
import { useLoadTrailerQuery } from "../../../app/api/trailers";
import { useLoadTruckQuery } from "../../../app/api/trucks";
import { Loader } from "../../Loader/Loader";
import { CargoStatus, EmptyState } from "../../ui/ui";
import { cx, initials, shipmentRef } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import styles from "./CargoPreview.module.css";
import { formatCargoWeight } from "../../../utils/units";

const formatDate = (iso: string) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Not set";

const Section = ({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) => (
  <section className={cx(ui.card, wide && styles.wide)}>
    <div className={ui.cardHeader}>
      <h2 className={ui.cardTitle}>{title}</h2>
    </div>
    <div className={ui.cardBody}>{children}</div>
  </section>
);

const Detail = ({ label, value }: { label: string; value?: ReactNode }) => (
  <div className={styles.detail}>
    <dt>{label}</dt>
    <dd>{value || <span className={ui.muted}>–</span>}</dd>
  </div>
);

const Contact = ({ company, person, address, phone, email }: Record<string, string>) => (
  <div className={styles.contact}>
    <span className={ui.avatar}>{initials(...company.split(" "))}</span>
    <div>
      <span className={ui.primaryText}>{company || "–"}</span>
      <span className={ui.secondaryText}>{address}</span>
      <dl className={styles.details}>
        <Detail label="Contact" value={person} />
        <Detail label="Phone" value={phone && <a href={`tel:${phone}`}>{phone}</a>} />
        <Detail label="Email" value={email && <a href={`mailto:${email}`}>{email}</a>} />
      </dl>
    </div>
  </div>
);

export const CargoPreview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cargo, isError, isLoading } = useLoadCargoQuery(id!, { skip: !id });
  const { data: driver } = useLoadDriverQuery(cargo?.driverId ?? skipToken);
  const { data: truck } = useLoadTruckQuery(cargo?.truckId ?? skipToken);
  const { data: trailer } = useLoadTrailerQuery(cargo?.trailerId ?? skipToken);

  if (isLoading) return <Loader />;
  if (isError || !cargo) {
    return <EmptyState icon={faTriangleExclamation} title="Cargo not found" text="It may have been deleted." />;
  }

  return (
    <>
      <div className={styles.top}>
        <button className={cx(ui.btn, ui.secondary, ui.small)} onClick={() => navigate("/cargoList")}>
          <FontAwesomeIcon icon={faArrowLeft} /> All cargo
        </button>
      </div>

      <div className={ui.header}>
        <div>
          <p className={styles.eyebrow}>
            {shipmentRef(cargo.id)} · {cargo.source && cargo.source !== "manual" ? "Imported from load board" : "Added manually"}
          </p>
          <h1 className={cx(ui.title, styles.routeTitle)}>
            {cargo.pickupLocation || "–"} <FontAwesomeIcon icon={faArrowRight} className={styles.arrow} />{" "}
            {cargo.deliveryLocation || "–"}
          </h1>
          <div className={styles.statusRow}>
            <CargoStatus status={cargo.status} />
            {cargo.delayMinutes && (
              <span className={styles.delay}>
                Delayed {cargo.delayMinutes} min{cargo.delayReason && ` · ${cargo.delayReason}`}
              </span>
            )}
          </div>
        </div>
        <div className={ui.actions}>
          <button className={cx(ui.btn, ui.primary)} onClick={() => navigate(`/cargoList/${cargo.id}/edit`)}>
            <FontAwesomeIcon icon={faPen} /> Edit cargo
          </button>
        </div>
      </div>

      <div className={styles.summary}>
        <div className={ui.stat}>
          <span className={ui.statLabel}>Goods</span>
          <span className={styles.summaryValue}>{cargo.descriptionOfGoods || "–"}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statLabel}>Weight</span>
          <span className={styles.summaryValue}>{cargo.weight ? formatCargoWeight(cargo.weight) : "–"}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statLabel}>Freight cost</span>
          <span className={styles.summaryValue}>{cargo.freightCost || "–"}</span>
        </div>
        <div className={ui.stat}>
          <span className={ui.statLabel}>Service</span>
          <span className={styles.summaryValue}>{cargo.serviceType || "–"}</span>
        </div>
      </div>

      <div className={styles.grid}>
        <Section title="Schedule">
          <ol className={styles.timeline}>
            <li>
              <span className={cx(styles.dot, styles.pickup)} />
              <div>
                <span className={ui.secondaryText}>Pickup</span>
                <span className={ui.primaryText}>{cargo.pickupLocation}</span>
                <span className={ui.secondaryText}>{formatDate(cargo.pickupDate)}</span>
              </div>
            </li>
            <li>
              <FontAwesomeIcon icon={faLocationDot} className={styles.pin} />
              <div>
                <span className={ui.secondaryText}>Delivery</span>
                <span className={ui.primaryText}>{cargo.deliveryLocation}</span>
                <span className={ui.secondaryText}>{formatDate(cargo.deliveryDate)}</span>
              </div>
            </li>
          </ol>
        </Section>

        <Section title="Assignment">
          <dl className={styles.details}>
            <Detail label="Driver" value={driver && `${driver.firstName} ${driver.lastName}`} />
            <Detail label="Truck" value={truck && `${truck.truckNumber} · ${truck.truckModel}`} />
            <Detail label="Trailer" value={trailer && `${trailer.trailerNumber} · ${trailer.trailer}`} />
          </dl>
          {!cargo.truckId && (
            <button className={cx(ui.btn, ui.secondary, ui.small, styles.assign)} onClick={() => navigate("/dispatcher")}>
              Assign in Dispatch
            </button>
          )}
        </Section>

        <Section title="Shipper">
          <Contact
            company={cargo.shipperName}
            person={cargo.contactPerson}
            address={cargo.shipperAddress}
            phone={cargo.phoneNumber}
            email={cargo.emailAddress}
          />
        </Section>

        <Section title="Receiver">
          <Contact
            company={cargo.receiverName}
            person={cargo.receiverContact}
            address={cargo.receiverAddress}
            phone={cargo.receiverPhone}
            email={cargo.receiverEmail}
          />
        </Section>

        <Section title="Load and requirements">
          <dl className={styles.details}>
            <Detail label="Quantity" value={cargo.quantity} />
            <Detail label="Dimensions" value={cargo.dimensions && `${cargo.dimensions} cm`} />
            <Detail label="Truck type" value={cargo.truckType} />
            <Detail label="Temperature" value={cargo.temperatureControl} />
            <Detail label="Hazardous" value={cargo.hazardousMaterial} />
            <Detail label="Handling" value={cargo.specialHandlingInstructions} />
          </dl>
        </Section>

        <Section title="Payment and notes">
          <dl className={styles.details}>
            <Detail label="Freight cost" value={cargo.freightCost} />
            <Detail label="Payment terms" value={cargo.paymentTerms} />
            <Detail label="Notes" value={cargo.notes} />
          </dl>
        </Section>
      </div>

    </>
  );
};
