import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";

import { useFetchCargosQuery } from "../../app/api/cargos";
import { useFetchTrucksQuery, type Truck } from "../../app/api/trucks";
import { useCargoRouteQuery, type RoutePlan } from "../../app/api/routing";
import { useLatestPositionsQuery } from "../../app/api/telematics";
import { useTruckOriginsQuery } from "../../app/api/trips";
import { crewOf, rankTrucks, type Crew } from "../../utils/crew";
import { formatDistance, formatDuration } from "../../utils/format";
import { groupMessages } from "../../utils/notices";
import { Loader } from "../Loader/Loader";
import { MapDetailsCard, PanelHeader } from "../ui/ui";
import CrewPicker from "./CrewPicker";
import DispatchMap from "./DispatchMap";
import { useAssignWithRestrictions } from "./useAssignWithRestrictions";

import page from "../ui/mapPage.module.css";
import styles from "./Dispatcher.module.css";
import { formatCargoWeight, formatLength, formatWeight } from "../../utils/units";
import { errorMessage } from "../../utils/errors";
import { isFinished } from "../../utils/status";

const ALERT_LABELS: Record<string, string> = {
  tunnel: "tunnels",
  toll: "toll roads",
  countryBorderCrossing: "border crossings",
  stateBorderCrossing: "state border crossings",
};

const truckLimits = (truck: Truck) =>
  [
    truck.heightM && `${formatLength(truck.heightM)} high`,
    truck.widthM && `${formatLength(truck.widthM)} wide`,
    truck.weightT && formatWeight(truck.weightT * 1000),
  ]
    .filter(Boolean)
    .join(" · ");

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
            {groupMessages(violations.map((notice) => notice.message)).map(({ message, count }) => (
              <li key={message}>
                {message}
                {count > 1 && ` (${count} places)`}
              </li>
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
  const { data: positions } = useLatestPositionsQuery();
  const { assign, dialog: restrictionsDialog, error: assignError, isLoading: isAssigning } = useAssignWithRestrictions();

  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Crew>(crewOf(undefined));
  const [routeIndex, setRouteIndex] = useState(0);
  const { data: origins } = useTruckOriginsQuery(selectedId ?? skipToken);

  const cargo = cargos?.find((item) => item.id === selectedId);
  const truck = trucks?.find((item) => item.id === draft.truckId);
  const trucksById = useMemo(() => new Map((trucks ?? []).map((t) => [t.id, t])), [trucks]);
  const truckLabels = useMemo(() => new Map((trucks ?? []).map((t) => [t.id, t.truckNumber])), [trucks]);

  // Every truck, closest to the pickup first, measured from where it will be free. A busy truck
  // can still take the load: it is queued behind the truck's current ones.
  const truckChoices = useMemo(() => {
    const pickup = cargo?.pickupPoint;
    return rankTrucks(trucks ?? [], pickup ? [pickup.x, pickup.y] : undefined, positions, origins);
  }, [trucks, positions, origins, cargo]);

  const {
    data: route,
    isFetching: isRouting,
    error: routeError,
  } = useCargoRouteQuery(selectedId ? { cargoId: selectedId, truckId: draft.truckId || undefined } : skipToken);

  const selectCargo = (id: string) => {
    setSelectedId(id);
    setDraft(crewOf(cargos?.find((item) => item.id === id), trucks));
    setRouteIndex(0);
  };

  const clearSelection = () => {
    setSelectedId(undefined);
    setDraft(crewOf(undefined));
    setRouteIndex(0);
  };

  // A load picked on the map may be far down the list: bring its card into view.
  const queueRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    queueRef.current
      ?.querySelector(`[data-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const updateDraft = (crew: Crew) => {
    setDraft(crew);
    setRouteIndex(0);
  };

  const changed = !!cargo && JSON.stringify(crewOf(cargo, trucks)) !== JSON.stringify(draft);
  // A truck with no driver seated needs a driver picked for the load.
  const needsDriver = !!truck && !truck.driverId && !draft.driverId;
  // Delivered loads drop out of the dispatch queue.
  const activeCargos = (cargos ?? []).filter((item) => !isFinished(item.status));
  const plans = route?.routes ?? [];
  // Restrictions already accepted for this truck don't need asking about again.
  const accepted = !!cargo?.restrictionsAcceptedTruckId && cargo.restrictionsAcceptedTruckId === draft.truckId;
  // The server checks the primary route; while it is on screen, ask before sending.
  const knownViolations =
    draft.truckId && !accepted && !isRouting
      ? (plans[0]?.notices ?? []).filter((notice) => notice.type === "violation").map((notice) => notice.message)
      : [];

  if (isLoading) return <Loader />;
  if (isError) return <h1>There is an error</h1>;

  return (
    <div className={page.layout}>
      <section className={page.panel}>
        <PanelHeader
          title="Dispatch"
          description="Match each load with a truck; it brings its driver and trailer"
          subtitle={`${activeCargos.length} active · ${activeCargos.filter((c) => !c.truckId).length} waiting for a truck`}
        />
        <ul ref={queueRef} className={styles.queue}>
          {activeCargos.map((item) => (
            <li key={item.id} data-id={item.id}>
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
                <span className={styles.row}>
                  <span className={`${styles.status} ${styles[item.status] ?? ""}`}>{item.status.replace("_", " ")}</span>
                  {item.delayMinutes && (
                    <span className={styles.delay}>
                      delayed {item.delayMinutes} min{item.delayReason && ` · ${item.delayReason}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className={page.mapArea}>
        <DispatchMap
          cargos={activeCargos}
          selectedId={selectedId}
          onSelect={selectCargo}
          // The query keeps its last result after the load is deselected.
          route={cargo && !isRouting ? route : undefined}
          routeIndex={routeIndex}
          truckPositions={positions}
          truckLabels={truckLabels}
          selectedTruckId={draft.truckId || undefined}
        />
        {cargo && (
          <MapDetailsCard
            title={`${cargo.pickupLocation} → ${cargo.deliveryLocation}`}
            subtitle={[cargo.descriptionOfGoods || "Cargo", cargo.weight && formatCargoWeight(cargo.weight), cargo.truckType]
              .filter(Boolean)
              .join(" · ")}
            onClose={clearSelection}
          >
            <div className={styles.details}>
              <CrewPicker value={draft} onChange={updateDraft} current={cargo} choices={truckChoices} idPrefix="dispatch" />
              {truck ? (
                <p className={styles.note}>{truckLimits(truck) || "No dimensions set for this truck."}</p>
              ) : (
                <p className={styles.note}>Without a truck the route ignores height and weight limits.</p>
              )}
              {accepted && cargo.restrictionsAcceptedAt && (
                <p className={styles.error}>
                  Restrictions accepted by {cargo.restrictionsAcceptedBy} ·{" "}
                  {new Date(cargo.restrictionsAcceptedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}

              <button
                className={styles.assign}
                disabled={!changed || needsDriver || isAssigning}
                onClick={() => assign({ id: cargo.id, ...draft }, knownViolations)}
              >
                {isAssigning ? "Saving..." : "Assign"}
              </button>
              {assignError && <p className={styles.error}>{assignError}</p>}

              <h4>Route</h4>
              {isRouting && <p className={styles.note}>Calculating route...</p>}
              {!isRouting && routeError && <p className={styles.error}>{errorMessage(routeError, "Could not calculate a route.")}</p>}
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
          </MapDetailsCard>
        )}
      </div>
      {restrictionsDialog}
    </div>
  );
};

export default Dispatcher;
