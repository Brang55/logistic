import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrailer, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteTrailerMutation,
  useFetchTrailersQuery,
  type Trailer,
} from "../../../app/features/driver/trailerSlice";
import { useFleetAttentionQuery } from "../../../app/features/driver/vehicleRecordsSlice";
import { Loader } from "../../Loader/Loader";
import { AttentionSummary } from "../../Vehicles/records";
import { ConfirmDialog, EmptyState, FilterChips, IconButton, PageHeader, ResourceStatus, SearchInput } from "../../ui/ui";
import { cx, matches } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import AddTrailerForm from "../AddTrailer/AddTrailerForm/AddTrailerForm";

type Filter = "all" | "available" | "taken";

const TrailersList = () => {
  const { data: trailers = [], isError, isLoading } = useFetchTrailersQuery();
  const [deleteTrailer, deleting] = useDeleteTrailerMutation();
  const { data: attention = [] } = useFleetAttentionQuery();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Trailer>();
  const [removing, setRemoving] = useState<Trailer>();

  const available = trailers.filter((t) => t.status === "available").length;
  const visible = useMemo(
    () =>
      trailers.filter(
        (t) => (filter === "all" || t.status === filter) && matches(search, t.trailerNumber, t.trailer)
      ),
    [trailers, filter, search]
  );

  if (isLoading) return <Loader />;

  return (
    <>
      <PageHeader
        title="Trailers"
        subtitle={`${trailers.length} trailers · ${available} available`}
        actions={
          <button className={cx(ui.btn, ui.primary)} onClick={() => setAdding(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add trailer
          </button>
        }
      />

      <div className={ui.card}>
        <div className={ui.toolbar}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search number or type" />
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: trailers.length },
              { value: "available", label: "Available", count: available },
              { value: "taken", label: "On a trip", count: trailers.length - available },
            ]}
          />
        </div>

        {isError ? (
          <EmptyState icon={faTriangleExclamation} title="Could not load trailers" text="Check your connection and try again." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={faTrailer}
            title={trailers.length ? "No trailers match" : "No trailers yet"}
            text={trailers.length ? "Try a different search or filter." : "Add trailers to assign them to cargo."}
          />
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Trailer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Attention</th>
                  <th className={ui.right}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((trailer) => (
                  <tr key={trailer.id} className={ui.clickable} onClick={() => navigate(`/trailers/${trailer.id}`)}>
                    <td data-label="Trailer">
                      <span className={ui.primaryText}>{trailer.trailerNumber}</span>
                    </td>
                    <td data-label="Type">{trailer.trailer || <span className={ui.muted}>Not set</span>}</td>
                    <td data-label="Status">
                      <ResourceStatus status={trailer.status} />
                    </td>
                    <td data-label="Attention">
                      <AttentionSummary items={attention.filter((item) => item.kind === "trailers" && item.vehicleId === trailer.id)} />
                    </td>
                    <td data-label="" className={ui.right}>
                      <div className={ui.rowActions}>
                        <IconButton icon={faPen} label={`Edit ${trailer.trailerNumber}`} onClick={() => setEditing(trailer)} />
                        <IconButton
                          icon={faTrash}
                          label={`Delete ${trailer.trailerNumber}`}
                          danger
                          onClick={() => setRemoving(trailer)}
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

      {adding && <AddTrailerForm open onClose={() => setAdding(false)} editTrailerForm={false} />}
      {editing && (
        <AddTrailerForm
          open
          editTrailerForm
          onClose={() => setEditing(undefined)}
          id={editing.id}
          trailer={editing.trailer}
          trailerNumber={editing.trailerNumber}
          status={editing.status}
        />
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete trailer ${removing.trailerNumber}?`}
          message="The trailer is removed and unassigned from any cargo. This can't be undone."
          confirmLabel="Delete trailer"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteTrailer(removing.id);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
};

export default TrailersList;
