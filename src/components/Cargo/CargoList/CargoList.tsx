import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxesStacked,
  faCheck,
  faEye,
  faPen,
  faPlus,
  faTrash,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import type Cargo from "../../../app/api/cargos";
import {
  useConfirmCargoMutation,
  useDeleteCargoMutation,
  useFetchCargosQuery,
} from "../../../app/api/cargos";
import { useFetchTrucksQuery } from "../../../app/api/trucks";
import { Loader } from "../../Loader/Loader";
import { CargoStatus, ConfirmDialog, EmptyState, FilterChips, IconButton, PageHeader, SearchInput } from "../../ui/ui";
import { cx, matches, shipmentRef } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import styles from "./CargoList.module.css";
import { formatCargoWeight } from "../../../utils/units";

type Filter = "all" | "open" | "confirmed" | "picked_up" | "delivered";

// "Open" = still being planned: new or edited and waiting for confirmation.
const inFilter = (cargo: Cargo, filter: Filter) =>
  filter === "all" ||
  (filter === "open" ? ["new", "edited"].includes(cargo.status) : cargo.status === filter);

const NEEDS_CONFIRMATION: Cargo["status"][] = ["new", "edited"];

const formatDate = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "–";

export const CargoList = () => {
  const navigate = useNavigate();
  const { data: cargos = [], isError, isLoading } = useFetchCargosQuery();
  const { data: trucks = [] } = useFetchTrucksQuery();
  const [deleteCargo, deleting] = useDeleteCargoMutation();
  const [confirmCargo, confirming] = useConfirmCargoMutation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [removing, setRemoving] = useState<Cargo>();
  const [confirmingCargo, setConfirmingCargo] = useState<Cargo>();

  const truckNumber = useMemo(() => new Map(trucks.map((t) => [t.id, t.truckNumber])), [trucks]);
  const count = (f: Filter) => cargos.filter((c) => inFilter(c, f)).length;
  const visible = cargos.filter(
    (c) =>
      inFilter(c, filter) &&
      matches(
        search,
        shipmentRef(c.id),
        c.shipperName,
        c.receiverName,
        c.pickupLocation,
        c.deliveryLocation,
        c.descriptionOfGoods,
        c.truckId ? truckNumber.get(c.truckId) : ""
      )
  );

  if (isLoading) return <Loader />;

  return (
    <>
      <PageHeader
        title="Cargo"
        subtitle={`${cargos.length} loads · ${count("open")} waiting for confirmation · ${count("picked_up")} in transit`}
        actions={
          <button className={cx(ui.btn, ui.primary)} onClick={() => navigate("/cargo")}>
            <FontAwesomeIcon icon={faPlus} /> Add cargo
          </button>
        }
      />

      <div className={ui.card}>
        <div className={ui.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search shipment, company, city or truck" />
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: cargos.length },
              { value: "open", label: "To confirm", count: count("open") },
              { value: "confirmed", label: "Confirmed", count: count("confirmed") },
              { value: "picked_up", label: "In transit", count: count("picked_up") },
              { value: "delivered", label: "Delivered", count: count("delivered") },
            ]}
          />
        </div>

        {isError ? (
          <EmptyState icon={faTriangleExclamation} title="Could not load cargo" text="Check your connection and try again." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={faBoxesStacked}
            title={cargos.length ? "No cargo matches" : "No cargo yet"}
            text={cargos.length ? "Try a different search or filter." : "Add a load or import one from the load board."}
          />
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Route</th>
                  <th>Shipper → receiver</th>
                  <th>Goods</th>
                  <th>Truck</th>
                  <th>Status</th>
                  <th className={ui.right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((cargo) => (
                  <tr key={cargo.id} className={ui.clickable} onClick={() => navigate(`/cargoList/${cargo.id}/preview`)}>
                    <td data-label="Shipment">
                      <span>
                        <span className={ui.primaryText}>{shipmentRef(cargo.id)}</span>
                        <span className={ui.secondaryText}>{cargo.source && cargo.source !== "manual" ? "Load board" : "Manual"}</span>
                      </span>
                    </td>
                    <td data-label="Route">
                      <span className={styles.route}>
                        <span>
                          <span className={ui.primaryText}>{cargo.pickupLocation || "–"}</span>
                          <span className={ui.secondaryText}>{formatDate(cargo.pickupDate)}</span>
                        </span>
                        <FontAwesomeIcon icon={faArrowRight} className={styles.arrow} />
                        <span>
                          <span className={ui.primaryText}>{cargo.deliveryLocation || "–"}</span>
                          <span className={ui.secondaryText}>{formatDate(cargo.deliveryDate)}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Shipper → receiver">
                      <span>
                        <span className={ui.primaryText}>{cargo.shipperName || "–"}</span>
                        <span className={ui.secondaryText}>{cargo.receiverName || "–"}</span>
                      </span>
                    </td>
                    <td data-label="Goods">
                      <span>
                        <span>{cargo.descriptionOfGoods || "–"}</span>
                        {cargo.weight && <span className={ui.secondaryText}>{formatCargoWeight(cargo.weight)}</span>}
                      </span>
                    </td>
                    <td data-label="Truck">
                      {cargo.truckId ? truckNumber.get(cargo.truckId) ?? "Assigned" : <span className={ui.muted}>Unassigned</span>}
                    </td>
                    <td data-label="Status">
                      <CargoStatus status={cargo.status} />
                    </td>
                    <td data-label="" className={ui.right}>
                      <div className={ui.rowActions}>
                        {NEEDS_CONFIRMATION.includes(cargo.status) && (
                          <IconButton icon={faCheck} label="Confirm" onClick={() => setConfirmingCargo(cargo)} />
                        )}
                        <IconButton
                          icon={faEye}
                          label="View details"
                          onClick={() => navigate(`/cargoList/${cargo.id}/preview`)}
                        />
                        <IconButton icon={faPen} label="Edit" onClick={() => navigate(`/cargoList/${cargo.id}/edit`)} />
                        <IconButton icon={faTrash} label="Delete" danger onClick={() => setRemoving(cargo)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmingCargo && (
        <ConfirmDialog
          title={`Confirm ${shipmentRef(confirmingCargo.id)}?`}
          message={`${confirmingCargo.pickupLocation} → ${confirmingCargo.deliveryLocation} for ${confirmingCargo.shipperName}. Confirmed loads appear in Track cargo.`}
          confirmLabel="Confirm load"
          busy={confirming.isLoading}
          onCancel={() => setConfirmingCargo(undefined)}
          onConfirm={async () => {
            await confirmCargo(confirmingCargo.id);
            setConfirmingCargo(undefined);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete ${shipmentRef(removing.id)}?`}
          message={`${removing.pickupLocation} → ${removing.deliveryLocation}. The assigned truck, driver and trailer are freed. This can't be undone.`}
          confirmLabel="Delete cargo"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteCargo(removing.id);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
};
