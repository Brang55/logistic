import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  useBoardLoadsQuery,
  useImportLoadMutation,
  useSyncBookedLoadsMutation,
  type BoardLoad,
} from "../../app/api/loadBoards";
import { Loader } from "../Loader/Loader";
import { IconButton, PageHeader } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

import styles from "./LoadBoard.module.css";
import { formatMiles, formatWeight, kmToMiles } from "../../utils/units";

const GUIDE_DISMISSED_KEY = "loadboard-guide-dismissed";

// Remembered per browser; storage can be unavailable (private mode), so failures are ignored.
const guideDismissed = () => {
  try {
    return localStorage.getItem(GUIDE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

const HowItWorks = ({ onDismiss }: { onDismiss: () => void }) => (
  <section className={styles.guide}>
    <FontAwesomeIcon icon={faCircleInfo} className={styles.guideIcon} />
    <div>
      <strong>How the load board works</strong>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          <span>Browse loads that shippers post on freight exchanges. Each row shows the rate and your nearest free truck.</span>
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          <span>
            <b>Add to my loads</b> copies an offer into your system as a new, unassigned load.
          </span>
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          <span>
            Assign a truck, driver and trailer to it in <b>Dispatch</b>.
          </span>
        </li>
      </ol>
      <p className={styles.muted}>
        Loads your company has already booked on a board are added automatically every 10 minutes, or right away with{" "}
        <b>Sync booked loads</b>.
      </p>
    </div>
    <IconButton icon={faXmark} label="Hide this guide" onClick={onDismiss} />
  </section>
);

const EQUIPMENT = ["Dry van", "Reefer", "Flatbed", "Tanker"];

const money = (amount: number, currency: string, decimals = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

const LoadRow = ({ load }: { load: BoardLoad }) => {
  const navigate = useNavigate();
  const [importLoad, { isLoading }] = useImportLoadMutation();
  const perMile = load.rate.amount / Math.max(kmToMiles(load.distanceKm), 1);

  return (
    <li className={styles.load}>
      <div className={styles.route}>
        <strong>
          {load.origin.city} → {load.destination.city}
        </strong>
        <span className={styles.muted}>
          {formatDate(load.pickupDate)} → {formatDate(load.deliveryDate)} · {formatMiles(load.distanceKm)}
        </span>
        <span className={styles.muted}>
          {load.commodity} · {formatWeight(load.weightKg)} · {load.shipper.name}
        </span>
      </div>
      <div className={styles.tags}>
        <span className={styles.tag}>{load.equipment}</span>
        {load.hazmat && <span className={`${styles.tag} ${styles.hazmat}`}>Hazmat</span>}
        {load.bookedByUs && <span className={`${styles.tag} ${styles.booked}`}>Booked by us</span>}
        <span className={styles.board}>{load.board}</span>
      </div>
      <div className={styles.rate}>
        <strong>{money(load.rate.amount, load.rate.currency)}</strong>
        <span className={styles.muted}>
          {money(perMile, load.rate.currency, 2)}/mi
        </span>
      </div>
      <div className={styles.truck}>
        {load.nearestTruck ? (
          <>
            <strong>{load.nearestTruck.truckNumber}</strong>
            <span className={styles.muted}>{formatMiles(load.nearestTruck.km)} away</span>
          </>
        ) : (
          <span className={styles.muted}>No free truck</span>
        )}
      </div>
      <div className={styles.actions}>
        {load.cargoId ? (
          <button
            className={styles.secondary}
            onClick={() => navigate("/dispatcher")}
            title="This load is already in your system. Open Dispatch to assign a truck."
          >
            Added · assign in Dispatch
          </button>
        ) : (
          <button
            className={styles.primary}
            disabled={isLoading}
            onClick={() => importLoad({ board: load.board, loadId: load.id })}
            title="Copy this offer into your loads as a new, unassigned load, ready to assign in Dispatch"
          >
            {isLoading ? "Adding..." : "Add to my loads"}
          </button>
        )}
      </div>
    </li>
  );
};

const LoadBoard = () => {
  const [equipment, setEquipment] = useState("");
  const { data: loads, isLoading, isFetching, isError } = useBoardLoadsQuery({ equipment });
  const [sync, syncState] = useSyncBookedLoadsMutation();
  const [showGuide, setShowGuide] = useState(() => !guideDismissed());
  const hideGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    } catch {
      // Not remembered; the guide shows again next visit.
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Load board"
        subtitle={
          <>
            Find loads that shippers post on freight exchanges and add them to your own loads. Showing sample loads
            from demo exchanges; real boards (DAT, Truckstop) plug in once API access is in place.
            {syncState.data &&
              ` Last sync imported ${syncState.data.imported.length} load${syncState.data.imported.length === 1 ? "" : "s"}.`}
          </>
        }
        actions={
          <div className={styles.filters}>
            <select
              className={cx(ui.input, styles.equipment)}
              aria-label="Equipment"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
            >
              <option value="">Any equipment</option>
              {EQUIPMENT.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              className={styles.primary}
              onClick={() => sync()}
              disabled={syncState.isLoading}
              title="Add every load your company has booked on a board that isn't in your loads yet"
            >
              {syncState.isLoading ? "Syncing..." : "Sync booked loads"}
            </button>
          </div>
        }
      />
      {showGuide && <HowItWorks onDismiss={hideGuide} />}
      {loads && loads.length > 0 && (
        <div className={styles.columns} aria-hidden>
          <span>Route</span>
          <span>Equipment · board</span>
          <span>Rate</span>
          <span>Nearest free truck</span>
          <span />
        </div>
      )}
      {(isLoading || (isFetching && !loads)) && <Loader />}
      {isError && <p>Could not load the boards.</p>}
      {loads && loads.length === 0 && <p>No loads match these filters.</p>}
      <ul className={styles.list}>
        {loads?.map((load) => (
          <LoadRow key={`${load.board}:${load.id}`} load={load} />
        ))}
      </ul>
    </div>
  );
};

export default LoadBoard;
