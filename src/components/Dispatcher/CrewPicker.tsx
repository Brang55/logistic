import { useState } from "react";

import type Cargo from "../../app/api/cargos";
import { useFetchDriversQuery } from "../../app/api/drivers";
import { useFetchTrailersQuery } from "../../app/api/trailers";
import { useFetchTrucksQuery } from "../../app/api/trucks";
import { fullName, rankTrucks, withTruck, type Crew, type TruckChoice } from "../../utils/crew";
import { formatDistance } from "../../utils/format";
import ui from "../ui/ui.module.css";
import styles from "./CrewPicker.module.css";

interface CrewPickerProps {
  value: Crew;
  onChange: (crew: Crew) => void;
  /** The load's current assignment, which stays selectable. */
  current?: Pick<Cargo, "truckId" | "driverId" | "trailerId">;
  /** Trucks ranked for the load (see `rankTrucks`); defaults to all trucks by number. */
  choices?: TruckChoice[];
  idPrefix?: string;
}

/**
 * Picks the truck for a load. The truck brings its own driver and hooked trailer; the dispatcher
 * can still put a relief driver or another trailer on this one load.
 */
const CrewPicker = ({ value, onChange, current, choices, idPrefix = "crew" }: CrewPickerProps) => {
  const { data: trucks = [] } = useFetchTrucksQuery();
  const { data: drivers = [] } = useFetchDriversQuery();
  const { data: trailers = [] } = useFetchTrailersQuery();
  const [pickingDriver, setPickingDriver] = useState(false);

  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const trucksById = new Map(trucks.map((truck) => [truck.id, truck]));
  const truck = trucksById.get(value.truckId);
  const seated = truck?.driverId ? driversById.get(truck.driverId) : undefined;
  const showDrivers = !!truck && (!seated || pickingDriver || !!value.driverId);

  const truckLabel = ({ truck: item, km, afterLoads }: TruckChoice) => {
    const driver = item.driverId ? driversById.get(item.driverId) : undefined;
    const trailer = trailers.find((t) => t.id === item.trailerId);
    return [
      item.truckNumber,
      driver ? fullName(driver) : "no driver",
      km !== undefined && `${formatDistance(km * 1000)} from pickup${afterLoads ? " after its loads" : ""}`,
      trailer?.trailerNumber,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  // Free trailers, the load's own, and the one hooked to the chosen truck.
  const trailerOptions = trailers.filter(
    (item) => item.status === "available" || item.id === current?.trailerId || item.id === truck?.trailerId || item.id === value.trailerId,
  );
  const hookedTo = new Map(trucks.filter((t) => t.trailerId).map((t) => [t.trailerId, t.truckNumber]));

  return (
    <>
      <div className={ui.field}>
        <label htmlFor={`${idPrefix}-truck`} className={ui.label}>
          Truck
        </label>
        <select
          id={`${idPrefix}-truck`}
          className={ui.input}
          value={value.truckId}
          onChange={(e) => {
            setPickingDriver(false);
            onChange(withTruck(value, trucksById.get(e.target.value), truck));
          }}
        >
          <option value="">No truck</option>
          {(choices ?? rankTrucks(trucks)).map((choice) => (
            <option key={choice.truck.id} value={choice.truck.id}>
              {truckLabel(choice)}
            </option>
          ))}
        </select>
        {truck && (
          <span className={styles.hint}>
            {seated ? (
              <>
                Driven by {fullName(seated)}
                {!showDrivers && (
                  <button type="button" className={styles.linkButton} onClick={() => setPickingDriver(true)}>
                    Different driver…
                  </button>
                )}
              </>
            ) : (
              <span className={styles.warning}>No driver is seated in {truck.truckNumber}. Pick one for this load.</span>
            )}
          </span>
        )}
      </div>

      {showDrivers && (
        <div className={ui.field}>
          <label htmlFor={`${idPrefix}-driver`} className={ui.label}>
            Driver for this load
          </label>
          <select
            id={`${idPrefix}-driver`}
            className={ui.input}
            value={value.driverId}
            onChange={(e) => {
              if (!e.target.value) setPickingDriver(false);
              onChange({ ...value, driverId: e.target.value });
            }}
          >
            <option value="">{seated ? `${fullName(seated)} (drives ${truck.truckNumber})` : "Pick a driver…"}</option>
            {drivers
              .filter((driver) => driver.id !== seated?.id)
              .map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {fullName(driver)} · {driver.truckNumber ? `drives ${driver.truckNumber}` : "no truck"}
                  {driver.status === "taken" && " · on a trip"}
                </option>
              ))}
          </select>
          {value.driverId && <span className={styles.hint}>A relief driver drives this load only.</span>}
        </div>
      )}

      <div className={ui.field}>
        <label htmlFor={`${idPrefix}-trailer`} className={ui.label}>
          Trailer
        </label>
        <select
          id={`${idPrefix}-trailer`}
          className={ui.input}
          value={value.trailerId}
          onChange={(e) => onChange({ ...value, trailerId: e.target.value })}
        >
          <option value="">No trailer</option>
          {trailerOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.trailerNumber} · {item.trailer}
              {hookedTo.has(item.id) && ` · on ${hookedTo.get(item.id)}`}
            </option>
          ))}
        </select>
        {truck && value.trailerId && value.trailerId !== truck.trailerId && truck.trailerId && (
          <span className={styles.hint}>
            {truck.truckNumber} has {trailers.find((t) => t.id === truck.trailerId)?.trailerNumber} hooked up; this load uses another trailer.
          </span>
        )}
      </div>
    </>
  );
};

export default CrewPicker;
