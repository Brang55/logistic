import { useNextPickupsQuery } from "../../app/api/trips";
import { formatDistance, formatDuration } from "../../utils/format";
import { useAssignWithRestrictions } from "../Dispatcher/useAssignWithRestrictions";

import styles from "./LiveFleet.module.css";
import { formatMiles } from "../../utils/units";
import { errorMessage } from "../../utils/errors";

const SHOWN = 5;

/**
 * Unassigned loads ranked by drive time from where the truck will be free.
 * Assigning queues the load behind the truck's current ones, with the driver of its current load
 * (else the truck's own driver).
 */
const NextPickups = ({ truckId, driverId }: { truckId: string; driverId?: string | null }) => {
  const { data, isFetching, error } = useNextPickupsQuery(truckId);
  const { assign, dialog, error: assignError, isLoading: isAssigning } = useAssignWithRestrictions();

  return (
    <div className={styles.nextPickups}>
      <h4>Suggested next pickups</h4>
      {isFetching && <p className={styles.muted}>Checking drive times...</p>}
      {!isFetching && error && <p className={styles.muted}>{errorMessage(error, "Could not load suggestions.")}</p>}
      {!isFetching && data && (
        <>
          <p className={styles.muted}>
            {data.origin.after === "current-loads"
              ? `After its current loads (free around ${new Date(data.origin.availableAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}).`
              : "From where the truck is now."}{" "}
            Drive times use live traffic for cars; check the truck route before assigning.
          </p>
          {data.candidates.length === 0 && <p className={styles.muted}>No unassigned loads within {formatMiles(data.maxDistanceKm)}.</p>}
          <ul>
            {data.candidates.slice(0, SHOWN).map(({ cargo, durationS, distanceM, onTime }) => (
              <li key={cargo.id} className={styles.suggestion}>
                <span className={styles.truckName}>
                  {cargo.pickupLocation} → {cargo.deliveryLocation}
                </span>
                <span className={styles.muted}>
                  {durationS === null || distanceM === null
                    ? "No road route found"
                    : `${formatDuration(durationS)} · ${formatDistance(distanceM)} to pickup`}
                  {onTime === false && <span className={styles.late}> · late for pickup {cargo.pickupDate}</span>}
                  {onTime === true && ` · pickup ${cargo.pickupDate}`}
                </span>
                <button
                  className={styles.assignNext}
                  disabled={isAssigning}
                  onClick={() => assign({ id: cargo.id, truckId, driverId: driverId ?? undefined })}
                >
                  Assign as next
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {assignError && <p className={styles.late}>{assignError}</p>}
      {dialog}
    </div>
  );
};

export default NextPickups;
