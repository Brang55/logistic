import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrash, faTriangleExclamation, faTruck } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteTruckMutation,
  useFetchTrucksQuery,
  type Truck,
} from "../../../app/api/trucks";
import { useFetchDriversQuery } from "../../../app/api/drivers";
import { useFetchTrailersQuery } from "../../../app/api/trailers";
import { fullName } from "../../../utils/crew";
import { useFleetAttentionQuery } from "../../../app/api/vehicleRecords";
import { Loader } from "../../Loader/Loader";
import { AttentionSummary } from "../../Vehicles/records";
import { ConfirmDialog, EmptyState, FilterChips, IconButton, PageHeader, ResourceStatus, SearchInput } from "../../ui/ui";
import { cx, matches } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import table from "../../ui/table.module.css";
import AddTruckForm from "../AddTruck/AddTruckForm/AddTruckForm";
import { formatLength, formatWeight } from "../../../utils/units";

type Filter = "all" | "available" | "taken";

const dimensions = (truck: Truck) =>
  [truck.heightM && `${formatLength(truck.heightM)} high`, truck.widthM && `${formatLength(truck.widthM)} wide`].filter(Boolean).join(" · ");

const load = (truck: Truck) =>
  [truck.weightT && formatWeight(truck.weightT * 1000), truck.axles && `${truck.axles} axles`].filter(Boolean).join(" · ");

const TrucksList = () => {
  const { data: trucks = [], isError, isLoading } = useFetchTrucksQuery();
  const [deleteTruck, deleting] = useDeleteTruckMutation();
  const { data: attention = [] } = useFleetAttentionQuery();
  const { data: drivers = [] } = useFetchDriversQuery();
  const { data: trailers = [] } = useFetchTrailersQuery();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Truck>();
  const [removing, setRemoving] = useState<Truck>();

  const available = trucks.filter((t) => t.status === "available").length;
  const driverNames = useMemo(() => new Map(drivers.map((d) => [d.id, fullName(d)])), [drivers]);
  const trailerNames = useMemo(() => new Map(trailers.map((t) => [t.id, `${t.trailerNumber} · ${t.trailer}`])), [trailers]);
  const driverOf = (truck: Truck) => (truck.driverId ? driverNames.get(truck.driverId) : undefined);
  const visible = useMemo(
    () =>
      trucks.filter(
        (t) =>
          (filter === "all" || t.status === filter) &&
          matches(search, t.truckNumber, t.truckModel, t.plate, t.engineVariation, t.driverId && driverNames.get(t.driverId))
      ),
    [trucks, filter, search, driverNames]
  );

  if (isLoading) return <Loader />;

  return (
    <>
      <PageHeader
        title="Trucks"
        subtitle={`${trucks.length} trucks in the fleet · ${available} available`}
        actions={
          <button className={cx(ui.btn, ui.primary)} onClick={() => setAdding(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add truck
          </button>
        }
      />

      <div className={table.stats}>
        <div className={table.stat}>
          <span className={table.statValue}>{trucks.length}</span>
          <span className={table.statLabel}>Total trucks</span>
        </div>
        <div className={table.stat}>
          <span className={table.statValue}>{available}</span>
          <span className={table.statLabel}>Available</span>
        </div>
        <div className={table.stat}>
          <span className={table.statValue}>{trucks.length - available}</span>
          <span className={table.statLabel}>On a trip</span>
        </div>
      </div>

      <div className={ui.card}>
        <div className={table.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search number, model, plate or driver" />
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: trucks.length },
              { value: "available", label: "Available", count: available },
              { value: "taken", label: "On a trip", count: trucks.length - available },
            ]}
          />
        </div>

        {isError ? (
          <EmptyState icon={faTriangleExclamation} title="Could not load trucks" text="Check your connection and try again." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={faTruck}
            title={trucks.length ? "No trucks match" : "No trucks yet"}
            text={trucks.length ? "Try a different search or filter." : "Add your first truck to start dispatching."}
          />
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th>Truck</th>
                  <th>Driver and trailer</th>
                  <th>Make and model</th>
                  <th>Dimensions</th>
                  <th>Weight</th>
                  <th>Status</th>
                  <th>Attention</th>
                  <th className={table.right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((truck) => (
                  <tr key={truck.id} className={table.clickable} onClick={() => navigate(`/trucks/${truck.id}`)}>
                    <td data-label="Truck">
                      <span>
                        <span className={ui.primaryText}>{truck.truckNumber}</span>
                        {truck.plate && <span className={ui.secondaryText}>{truck.plate}</span>}
                      </span>
                    </td>
                    <td data-label="Driver and trailer" className={table.cellWide}>
                      <span>
                        <span className={driverOf(truck) ? ui.primaryText : ui.muted}>{driverOf(truck) ?? "No driver"}</span>
                        <span className={ui.secondaryText}>
                          {(truck.trailerId && trailerNames.get(truck.trailerId)) || "No trailer hooked"}
                        </span>
                      </span>
                    </td>
                    <td data-label="Make and model">
                      <span>
                        <span className={ui.primaryText}>{truck.truckModel || "–"}</span>
                        {truck.engineVariation && <span className={ui.secondaryText}>{truck.engineVariation}</span>}
                      </span>
                    </td>
                    <td data-label="Dimensions" className={ui.muted}>
                      {dimensions(truck) || "Not set"}
                    </td>
                    <td data-label="Weight" className={ui.muted}>
                      {load(truck) || "Not set"}
                    </td>
                    <td data-label="Status" className={table.cellStatus}>
                      <ResourceStatus status={truck.status} />
                    </td>
                    <td data-label="Attention">
                      <AttentionSummary items={attention.filter((item) => item.kind === "trucks" && item.vehicleId === truck.id)} />
                    </td>
                    <td data-label="" className={table.right}>
                      <div className={table.rowActions}>
                        <IconButton icon={faPen} label={`Edit ${truck.truckNumber}`} onClick={() => setEditing(truck)} />
                        <IconButton
                          icon={faTrash}
                          label={`Delete ${truck.truckNumber}`}
                          danger
                          onClick={() => setRemoving(truck)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && <AddTruckForm open onClose={() => setAdding(false)} editTruckForm={false} />}
      {editing && (
        <AddTruckForm
          open
          editTruckForm
          onClose={() => setEditing(undefined)}
          id={editing.id}
          status={editing.status}
          truckNumber={editing.truckNumber}
          truckModel={editing.truckModel}
          engineVariation={editing.engineVariation}
          heightM={editing.heightM}
          widthM={editing.widthM}
          lengthM={editing.lengthM}
          weightT={editing.weightT}
          axles={editing.axles}
          trailerId={editing.trailerId}
        />
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete truck ${removing.truckNumber}?`}
          message="The truck is removed from the fleet and unassigned from any cargo. This can't be undone."
          confirmLabel="Delete truck"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteTruck(removing.id);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
};

export default TrucksList;
