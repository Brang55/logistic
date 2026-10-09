import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";

import type Cargo from "../../app/features/driver/cargoSlice";
import {
  useAssignCargoMutation,
  useFetchCargosQuery,
} from "../../app/features/driver/cargoSlice";
import { useFetchDriversQuery } from "../../app/features/driver/driverSlice";
import { useFetchTrailersQuery } from "../../app/features/driver/trailerSlice";
import { useFetchTrucksQuery, type Truck } from "../../app/features/driver/truckSlice";
import { useCargoRouteQuery, type RoutePlan } from "../../app/features/driver/routingSlice";
import { useLatestPositionsQuery } from "../../app/features/driver/telematicsSlice";
import { formatDistance, formatDuration } from "../../utils/format";
import { distanceKm } from "../../utils/geo";
import { Loader } from "../Loader/Loader";
import DispatchMap from "./DispatchMap";

import styles from "./Dispatcher.module.css";

interface Draft {
  driverId: string;
  truckId: string;
  trailerId: string;
}

const draftFrom = (cargo?: Cargo): Draft => ({
  driverId: cargo?.driverId ?? "",
  truckId: cargo?.truckId ?? "",
  trailerId: cargo?.trailerId ?? "",
});

const ALERT_LABELS: Record<string, string> = {
  tunnel: "tunnels",
  toll: "toll roads",
  countryBorderCrossing: "border crossings",
  stateBorderCrossing: "state border crossings",
};

const truckLimits = (truck: Truck) =>
  [
    truck.heightM && `${truck.heightM} m high`,
    truck.widthM && `${truck.widthM} m wide`,
    truck.weightT && `${truck.weightT} t`,
  ]
    .filter(Boolean)
    .join(" · ");

// Only resources that are free, plus whatever this cargo already holds, can be picked.
const selectable = <T extends { id: string; status: string }>(items: T[] | undefined, currentId?: string | null) =>
  (items ?? []).filter((item) => item.status === "available" || item.id === currentId);

const errorMessage = (error: unknown) => {
  const data = (error as { data?: { message?: string } } | undefined)?.data;
  return data?.message ?? "Could not calculate a route.";
};

const RouteSummary = ({ plan }: { plan: RoutePlan }) => {
  const violations = plan.notices.filter((notice) => notice.type === "violation");
  const alertCounts = plan.notices
    .filter((notice) => notice.type === "alert")
    .reduce<Record<string, number>>((counts, notice) => {
      counts[notice.subtype] = (counts[notice.subtype] ?? 0) + 1;
      return counts;
    }, {});
  const delayS = plan.typicalDurationS ? plan.durationS - plan.typicalDurationS : 0;

  return (
    <>
      {violations.length > 0 && (
        <div className={styles.violations}>
          <h4>Truck restrictions on this route ({violations.length})</h4>
          <ul>
            {violations.map((notice, index) => (
              <li key={index}>{notice.message}</li>
            ))}
          </ul>
        </div>
      )}
      {delayS > 60 && <p className={styles.note}>Traffic adds {formatDuration(delayS)} compared to usual.</p>}
      {Object.keys(alertCounts).length > 0 && (
        <p className={styles.note}>
          {Object.entries(alertCounts)
            .map(([subtype, count]) => `${count} ${ALERT_LABELS[subtype] ?? subtype}`)
            .join(" · ")}
        </p>
      )}
      {plan.incidents.length > 0 && (
        <details className={styles.incidents}>
          <summary>{plan.incidents.length} traffic incidents along the route</summary>
          <ul>
            {plan.incidents.map((incident) => (
              <li key={incident.id}>
                <span className={styles.impact}>{incident.impact}</span> {incident.description}
                {incident.closed && " (road closed)"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
};

const Dispatcher = () => {
  const { data: cargos, isLoading, isError } = useFetchCargosQuery();
  const { data: trucks } = useFetchTrucksQuery();
  const { data: drivers } = useFetchDriversQuery();
  const { data: trailers } = useFetchTrailersQuery();
  const { data: positions } = useLatestPositionsQuery();
  const [assignCargo, { isLoading: isAssigning }] = useAssignCargoMutation();

  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(draftFrom());
  const [routeIndex, setRouteIndex] = useState(0);

  const cargo = cargos?.find((item) => item.id === selectedId);
  const truck = trucks?.find((item) => item.id === draft.truckId);
  const trucksById = useMemo(() => new Map((trucks ?? []).map((t) => [t.id, t])), [trucks]);
  const truckLabels = useMemo(() => new Map((trucks ?? []).map((t) => [t.id, t.truckNumber])), [trucks]);

  // Selectable trucks, closest to the pickup first, with their straight-line distance.
  const truckOptions = useMemo(() => {
    const pickup = cargo?.pickupPoint;
    const where = new Map((positions ?? []).map((p) => [p.truckId, p.point]));
    return selectable(trucks, cargo?.truckId)
      .map((item) => {
        const at = where.get(item.id);
        return { truck: item, km: pickup && at ? distanceKm(at, [pickup.x, pickup.y]) : undefined };
      })
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [trucks, positions, cargo]);

  const {
    data: route,
    isFetching: isRouting,
    error: routeError,
  } = useCargoRouteQuery(selectedId ? { cargoId: selectedId, truckId: draft.truckId || undefined } : skipToken);

  const selectCargo = (id: string) => {
    setSelectedId(id);
    setDraft(draftFrom(cargos?.find((item) => item.id === id)));
    setRouteIndex(0);
  };

  const updateDraft = (changes: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setRouteIndex(0);
  };

  const changed = !!cargo && JSON.stringify(draftFrom(cargo)) !== JSON.stringify(draft);
  const plans = route?.routes ?? [];

  if (isLoading) return <Loader />;
  if (isError) return <h1>There is an error</h1>;

  return (
    <div className={styles.dispatcher}>
      <section className={styles.panel}>
        <h3 className={styles.title}>Dispatch</h3>
        <ul className={styles.queue}>
          {cargos?.map((item) => (
            <li key={item.id}>
              <button
                className={`${styles.cargo} ${item.id === selectedId ? styles.selected : ""}`}
                onClick={() => selectCargo(item.id)}
              >
                <span className={styles.cargoRoute}>
                  {item.pickupLocation} → {item.deliveryLocation}
                </span>
                <span className={styles.cargoMeta}>
                  {item.shipperName} · pickup {item.pickupDate}
                  {item.truckId && ` · ${trucksById.get(item.truckId)?.truckNumber ?? "truck assigned"}`}
                </span>
                <span className={`${styles.status} ${styles[item.status] ?? ""}`}>{item.status}</span>
              </button>
            </li>
          ))}
        </ul>

        {cargo && (
          <div className={styles.details}>
            <h4>{cargo.descriptionOfGoods || "Cargo"}</h4>
            <p className={styles.note}>
              {cargo.weight && `${cargo.weight} kg`} {cargo.truckType && `· ${cargo.truckType}`}
            </p>

            <label>
              Truck
              <select value={draft.truckId} onChange={(e) => updateDraft({ truckId: e.target.value })}>
                <option value="">No truck</option>
                {truckOptions.map(({ truck: item, km }) => (
                  <option key={item.id} value={item.id}>
                    {item.truckNumber} – {item.truckModel}
                    {km !== undefined && ` · ${Math.round(km)} km from pickup`}
                  </option>
                ))}
              </select>
            </label>
            {truck ? (
              <p className={styles.note}>{truckLimits(truck) || "No dimensions set for this truck."}</p>
            ) : (
              <p className={styles.note}>Without a truck the route ignores height and weight limits.</p>
            )}

            <label>
              Driver
              <select value={draft.driverId} onChange={(e) => updateDraft({ driverId: e.target.value })}>
                <option value="">No driver</option>
                {selectable(drivers, cargo.driverId).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Trailer
              <select value={draft.trailerId} onChange={(e) => updateDraft({ trailerId: e.target.value })}>
                <option value="">No trailer</option>
                {selectable(trailers, cargo.trailerId).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.trailerNumber} – {item.trailer}
                  </option>
                ))}
              </select>
            </label>

            <button
              className={styles.assign}
              disabled={!changed || isAssigning}
              onClick={() => assignCargo({ id: cargo.id, ...draft })}
            >
              {isAssigning ? "Saving..." : "Assign"}
            </button>

            <h4>Route</h4>
            {isRouting && <p className={styles.note}>Calculating route...</p>}
            {!isRouting && routeError && <p className={styles.error}>{errorMessage(routeError)}</p>}
            {!isRouting && route && plans.length === 0 && (
              <p className={styles.error}>No route found for this truck.</p>
            )}
            {!isRouting && plans.length > 0 && (
              <>
                <ul className={styles.routes}>
                  {plans.map((plan, index) => (
                    <li key={index}>
                      <button
                        className={`${styles.routeOption} ${index === routeIndex ? styles.selected : ""}`}
                        onClick={() => setRouteIndex(index)}
                      >
                        <strong>
                          {formatDuration(plan.durationS)} · {formatDistance(plan.distanceM)}
                        </strong>
                        <span>{plan.summary || `Route ${index + 1}`}</span>
                        {plan.notices.some((notice) => notice.type === "violation") && (
                          <span className={styles.error}>Has truck restrictions</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <RouteSummary plan={plans[routeIndex] ?? plans[0]} />
              </>
            )}
          </div>
        )}
      </section>
      <div className={styles.mapHandler}>
        <DispatchMap
          cargos={cargos ?? []}
          selectedId={selectedId}
          onSelect={selectCargo}
          route={isRouting ? undefined : route}
          routeIndex={routeIndex}
          truckPositions={positions}
          truckLabels={truckLabels}
          selectedTruckId={draft.truckId || undefined}
        />
      </div>
    </div>
  );
};

export default Dispatcher;
