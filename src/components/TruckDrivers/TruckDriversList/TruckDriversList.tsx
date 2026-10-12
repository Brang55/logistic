import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faPen, faPlus, faTrash, faTriangleExclamation, faUsers } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteDriverMutation,
  useFetchDriversQuery,
  type Driver,
} from "../../../app/api/drivers";
import { Loader } from "../../Loader/Loader";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  IconButton,
  PageHeader,
  ResourceStatus,
  SearchInput,
} from "../../ui/ui";
import { cx, initials, matches } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import table from "../../ui/table.module.css";
import AddDriverForm from "../AddDriver/AddDriverForm/AddDriverForm";
import DriverLoginForm from "../DriverLogin/DriverLoginForm";

type Filter = "all" | "available" | "taken";

const TruckDriversList = () => {
  const { data: drivers = [], isError, isLoading } = useFetchDriversQuery();
  const [deleteDriver, deleting] = useDeleteDriverMutation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Driver>();
  const [removing, setRemoving] = useState<Driver>();
  const [loginFor, setLoginFor] = useState<Driver>();

  const available = drivers.filter((d) => d.status === "available").length;
  const withLogin = drivers.filter((d) => d.userId).length;
  const visible = useMemo(
    () =>
      drivers.filter(
        (d) =>
          (filter === "all" || d.status === filter) &&
          matches(search, d.firstName, d.lastName, d.truckDriverEmail, d.truckNumber, d.phoneNumber)
      ),
    [drivers, filter, search]
  );

  if (isLoading) return <Loader />;

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle={`${drivers.length} drivers · ${available} available · ${withLogin} using the driver app`}
        actions={
          <button className={cx(ui.btn, ui.primary)} onClick={() => setAdding(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add driver
          </button>
        }
      />

      <div className={ui.card}>
        <div className={table.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone or truck" />
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: drivers.length },
              { value: "available", label: "Available", count: available },
              { value: "taken", label: "On a trip", count: drivers.length - available },
            ]}
          />
        </div>

        {isError ? (
          <EmptyState icon={faTriangleExclamation} title="Could not load drivers" text="Check your connection and try again." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={faUsers}
            title={drivers.length ? "No drivers match" : "No drivers yet"}
            text={drivers.length ? "Try a different search or filter." : "Add your drivers to assign them to loads."}
          />
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Phone</th>
                  <th>Truck</th>
                  <th>Driver app</th>
                  <th>Status</th>
                  <th className={table.right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((driver) => (
                  <tr key={driver.id}>
                    <td data-label="Driver">
                      <span className={ui.person}>
                        <span className={ui.avatar}>{initials(driver.firstName, driver.lastName)}</span>
                        <span>
                          <span className={ui.primaryText}>
                            {driver.firstName} {driver.lastName}
                          </span>
                          <span className={ui.secondaryText}>{driver.truckDriverEmail}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="Phone">
                      {driver.phoneNumber ? <a href={`tel:${driver.phoneNumber}`}>{driver.phoneNumber}</a> : "–"}
                    </td>
                    <td data-label="Truck">{driver.truckNumber || <span className={ui.muted}>–</span>}</td>
                    <td data-label="Driver app" className={table.cellWide}>
                      {driver.userId ? (
                        <Badge tone="success">Has login</Badge>
                      ) : (
                        <button className={cx(ui.btn, ui.secondary, ui.small)} onClick={() => setLoginFor(driver)}>
                          <FontAwesomeIcon icon={faKey} /> Create login
                        </button>
                      )}
                    </td>
                    <td data-label="Status" className={table.cellStatus}>
                      <ResourceStatus status={driver.status} />
                    </td>
                    <td data-label="" className={table.right}>
                      <div className={table.rowActions}>
                        <IconButton icon={faPen} label={`Edit ${driver.firstName}`} onClick={() => setEditing(driver)} />
                        <IconButton
                          icon={faTrash}
                          label={`Delete ${driver.firstName}`}
                          danger
                          onClick={() => setRemoving(driver)}
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

      {adding && <AddDriverForm open onClose={() => setAdding(false)} editDriverForm={false} />}
      {editing && (
        <AddDriverForm
          open
          editDriverForm
          onClose={() => setEditing(undefined)}
          id={editing.id}
          firstName={editing.firstName}
          lastName={editing.lastName}
          truckId={editing.truckId}
          truckDriverEmail={editing.truckDriverEmail}
          phoneNumber={editing.phoneNumber}
        />
      )}
      {loginFor && (
        <DriverLoginForm driverId={loginFor.id} email={loginFor.truckDriverEmail} onClose={() => setLoginFor(undefined)} />
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete ${removing.firstName} ${removing.lastName}?`}
          message="The driver is removed and unassigned from any cargo, and can no longer use the driver app. This can't be undone."
          confirmLabel="Delete driver"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteDriver(removing.id);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
};

export default TruckDriversList;
