import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useBoardLoadsQuery,
  useImportLoadMutation,
  useSyncBookedLoadsMutation,
  type BoardLoad,
} from "../../app/features/driver/loadBoardSlice";
import { Loader } from "../Loader/Loader";

import styles from "./LoadBoard.module.css";

const EQUIPMENT = ["Dry van", "Curtainsider", "Reefer", "Flatbed", "Tanker"];

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

const LoadRow = ({ load }: { load: BoardLoad }) => {
  const navigate = useNavigate();
  const [importLoad, { isLoading }] = useImportLoadMutation();
  const perKm = load.rate.amount / Math.max(load.distanceKm, 1);

  return (
    <li className={styles.load}>
      <div className={styles.route}>
        <strong>
          {load.origin.city} → {load.destination.city}
        </strong>
        <span className={styles.muted}>
          {formatDate(load.pickupDate)} → {formatDate(load.deliveryDate)} · {load.distanceKm.toLocaleString()} km
        </span>
        <span className={styles.muted}>
          {load.commodity} · {(load.weightKg / 1000).toFixed(1)} t · {load.shipper.name}
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
          {perKm.toFixed(2)} {load.rate.currency}/km
        </span>
      </div>
      <div className={styles.truck}>
        {load.nearestTruck ? (
          <>
            <strong>{load.nearestTruck.truckNumber}</strong>
            <span className={styles.muted}>{load.nearestTruck.km.toLocaleString()} km away</span>
          </>
        ) : (
          <span className={styles.muted}>No free truck</span>
        )}
      </div>
      <div className={styles.actions}>
        {load.cargoId ? (
          <button className={styles.secondary} onClick={() => navigate("/dispatcher")}>
            Imported · open in Dispatch
          </button>
        ) : (
          <button
            className={styles.primary}
            disabled={isLoading}
            onClick={() => importLoad({ board: load.board, loadId: load.id })}
          >
            {isLoading ? "Importing..." : "Import"}
          </button>
        )}
      </div>
    </li>
  );
};

const LoadBoard = () => {
  const [region, setRegion] = useState("");
  const [equipment, setEquipment] = useState("");
  const { data: loads, isLoading, isFetching, isError } = useBoardLoadsQuery({ region, equipment });
  const [sync, syncState] = useSyncBookedLoadsMutation();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h3>Load Board</h3>
        <div className={styles.filters}>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">EU + US</option>
            <option value="EU">Europe</option>
            <option value="US">United States</option>
          </select>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            <option value="">Any equipment</option>
            {EQUIPMENT.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className={styles.primary} onClick={() => sync()} disabled={syncState.isLoading}>
            {syncState.isLoading ? "Syncing..." : "Sync booked loads"}
          </button>
        </div>
      </div>
      <p className={styles.muted}>
        Sample loads from demo exchanges. Loads your company books on a board are imported automatically; real
        boards (DAT, Truckstop, Timocom, Trans.eu) plug in once API access is in place.
        {syncState.data &&
          ` Last sync imported ${syncState.data.imported.length} load${syncState.data.imported.length === 1 ? "" : "s"}.`}
      </p>
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
