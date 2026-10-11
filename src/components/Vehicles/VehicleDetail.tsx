import { Link, useParams, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPhone, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { useFetchCargosQuery } from "../../app/features/driver/cargoSlice";
import { useFetchDriversQuery } from "../../app/features/driver/driverSlice";
import { useLoadTrailerQuery } from "../../app/features/driver/trailerSlice";
import { useLoadTruckQuery } from "../../app/features/driver/truckSlice";
import {
  useFleetAttentionQuery,
  type AttentionItem,
  type VehicleKind,
} from "../../app/features/driver/vehicleRecordsSlice";
import { Loader } from "../Loader/Loader";
import { CargoStatus, EmptyState, PageHeader, ResourceStatus } from "../ui/ui";
import { cx, shipmentRef } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import DocumentsTab from "./DocumentsTab";
import LogbookTab from "./LogbookTab";
import MaintenanceTab from "./MaintenanceTab";
import { AttentionSummary } from "./records";
import { attentionText, formatDate, formatKm } from "./recordFormat";
import styles from "./VehicleDetail.module.css";
import { formatLength, formatWeight } from "../../utils/units";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "documents", label: "Documents" },
  { value: "maintenance", label: "Maintenance" },
  { value: "logbook", label: "Logbook" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const FINISHED = ["delivered", "cancelled"];

interface Vehicle {
  label: string;
  subtitle: string;
  status: string;
  odometerKm?: number | null;
  specs: [string, string | number | null | undefined][];
}

const useVehicle = (kind: VehicleKind, id: string): { vehicle?: Vehicle; isLoading: boolean; isError: boolean } => {
  const truck = useLoadTruckQuery(id, { skip: kind !== "trucks" });
  const trailer = useLoadTrailerQuery(id, { skip: kind !== "trailers" });
  if (kind === "trucks") {
    const t = truck.data;
    return {
      isLoading: truck.isLoading,
      isError: truck.isError,
      vehicle: t && {
        label: t.truckNumber,
        subtitle: [t.truckModel, t.plate].filter(Boolean).join(" · "),
        status: t.status,
        odometerKm: t.odometerKm,
        specs: [
          ["Make and model", t.truckModel],
          ["Engine", t.engineVariation],
          ["Plate", t.plate],
          ["VIN", t.vin],
          ["Height", t.heightM && formatLength(t.heightM)],
          ["Width", t.widthM && formatLength(t.widthM)],
          ["Length", t.lengthM && formatLength(t.lengthM)],
          ["Gross weight", t.weightT && formatWeight(t.weightT * 1000)],
          ["Axles", t.axles],
        ],
      },
    };
  }
  const t = trailer.data;
  return {
    isLoading: trailer.isLoading,
    isError: trailer.isError,
    vehicle: t && {
      label: t.trailerNumber,
      subtitle: t.trailer,
      status: t.status,
      specs: [
        ["Number", t.trailerNumber],
        ["Type", t.trailer],
      ],
    },
  };
};

const VehicleDetail = ({ kind }: { kind: VehicleKind }) => {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "overview") as Tab;
  const setTab = (value: Tab) => setParams(value === "overview" ? {} : { tab: value }, { replace: true });

  const { vehicle, isLoading, isError } = useVehicle(kind, id);
  const { data: attention = [] } = useFleetAttentionQuery();
  const issues = attention.filter((item) => item.kind === kind && item.vehicleId === id);
  const listPath = `/${kind}`;
  const listLabel = kind === "trucks" ? "Trucks" : "Trailers";

  if (isLoading) return <Loader />;
  if (isError || !vehicle) {
    return (
      <div className={ui.card}>
        <EmptyState
          icon={faTriangleExclamation}
          title={`${kind === "trucks" ? "Truck" : "Trailer"} not found`}
          text={<Link to={listPath}>Back to {listLabel.toLowerCase()}</Link>}
        />
      </div>
    );
  }

  return (
    <>
      <Link to={listPath} className={styles.back}>
        <FontAwesomeIcon icon={faArrowLeft} /> {listLabel}
      </Link>
      <PageHeader
        title={vehicle.label}
        subtitle={vehicle.subtitle || undefined}
        actions={
          <div className={styles.headerBadges}>
            <ResourceStatus status={vehicle.status} />
            <AttentionSummary items={issues} />
          </div>
        }
      />

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={cx(styles.tab, tab === t.value && styles.tabActive)}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview kind={kind} id={id} vehicle={vehicle} issues={issues} onOpen={setTab} />}
      {tab === "documents" && <DocumentsTab kind={kind} vehicleId={id} />}
      {tab === "maintenance" && <MaintenanceTab kind={kind} vehicleId={id} odometerKm={vehicle.odometerKm} />}
      {tab === "logbook" && <LogbookTab kind={kind} vehicleId={id} />}
    </>
  );
};

const Overview = ({
  kind,
  id,
  vehicle,
  issues,
  onOpen,
}: {
  kind: VehicleKind;
  id: string;
  vehicle: Vehicle;
  issues: AttentionItem[];
  onOpen: (tab: Tab) => void;
}) => {
  const { data: cargos = [] } = useFetchCargosQuery();
  const { data: drivers = [] } = useFetchDriversQuery();
  const loads = cargos
    .filter((c) => (kind === "trucks" ? c.truckId : c.trailerId) === id && !FINISHED.includes(c.status))
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));

  return (
    <div className={styles.overview}>
      <div className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.cardTitle}>Vehicle</h2>
        </div>
        <dl className={styles.specs}>
          {kind === "trucks" && (
            <div>
              <dt>Odometer</dt>
              <dd>
                {formatKm(vehicle.odometerKm)}
                <span className={ui.secondaryText}>Updated from logbook entries</span>
              </dd>
            </div>
          )}
          {vehicle.specs.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || <span className={ui.muted}>Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={styles.overviewSide}>
        <div className={ui.card}>
          <div className={ui.cardHeader}>
            <h2 className={ui.cardTitle}>Needs attention</h2>
          </div>
          {issues.length === 0 ? (
            <p className={cx(ui.cardBody, ui.muted, styles.noMargin)}>All documents are valid and no checks are due.</p>
          ) : (
            <ul className={styles.issues}>
              {issues.map((item) => (
                <li key={item.recordId}>
                  <button
                    className={cx(styles.issue, styles[`issue-${item.status}`])}
                    onClick={() => onOpen(item.recordType === "document" ? "documents" : "maintenance")}
                  >
                    <span className={ui.primaryText}>{item.title}</span>
                    <span className={ui.secondaryText}>{attentionText(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={ui.card}>
          <div className={ui.cardHeader}>
            <h2 className={ui.cardTitle}>Current loads</h2>
          </div>
          {loads.length === 0 ? (
            <p className={cx(ui.cardBody, ui.muted, styles.noMargin)}>No loads assigned.</p>
          ) : (
            <ul className={styles.loads}>
              {loads.map((cargo) => {
                const driver = drivers.find((d) => d.id === cargo.driverId);
                return (
                  <li key={cargo.id}>
                    <Link to={`/cargoList/${cargo.id}/preview`} className={styles.load}>
                      <span className={styles.loadTop}>
                        <span className={ui.primaryText}>
                          {cargo.pickupLocation} → {cargo.deliveryLocation}
                        </span>
                        <CargoStatus status={cargo.status} />
                      </span>
                      <span className={ui.secondaryText}>
                        {shipmentRef(cargo.id)} · pickup {formatDate(cargo.pickupDate)} · delivery {formatDate(cargo.deliveryDate)}
                      </span>
                      {driver && (
                        <span className={ui.secondaryText}>
                          Driver {driver.firstName} {driver.lastName}
                          {driver.phoneNumber && (
                            <>
                              {" · "}
                              <FontAwesomeIcon icon={faPhone} /> {driver.phoneNumber}
                            </>
                          )}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;
