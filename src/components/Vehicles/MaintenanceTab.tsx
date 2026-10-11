import { FormEvent, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faListCheck, faPen, faPlus, faTrash, faWrench } from "@fortawesome/free-solid-svg-icons";

import {
  useApplyChecklistMutation,
  useDeleteMaintenanceMutation,
  useMaintenanceQuery,
  useMarkMaintenanceDoneMutation,
  useSaveMaintenanceMutation,
  type MaintenanceItem,
  type VehicleKind,
} from "../../app/features/driver/vehicleRecordsSlice";
import { Loader } from "../Loader/Loader";
import { ConfirmDialog, EmptyState, IconButton, Modal } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import { MaintenanceStatus } from "./records";
import { apiErrorMessage, CHECKLISTS, dueText, formatDate, formatKm, intervalText, todayIso } from "./recordFormat";
import styles from "./VehicleDetail.module.css";
import { kmToMiles, milesToKm, toInputValue } from "../../utils/units";

interface Props {
  kind: VehicleKind;
  vehicleId: string;
  odometerKm?: number | null;
}

// Number inputs send null when cleared so the server can unset the value.
const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
// Distances are entered in miles and stored in km.
const kmOrNull = (miles: string) => {
  const value = numberOrNull(miles);
  return value === null ? null : Math.round(milesToKm(value));
};

const MaintenanceTab = ({ kind, vehicleId, odometerKm }: Props) => {
  const { data: items = [], isLoading } = useMaintenanceQuery({ kind, id: vehicleId });
  const [deleteItem, deleting] = useDeleteMaintenanceMutation();
  const [editing, setEditing] = useState<MaintenanceItem | "new">();
  const [completing, setCompleting] = useState<MaintenanceItem>();
  const [removing, setRemoving] = useState<MaintenanceItem>();
  const [choosingChecklist, setChoosingChecklist] = useState(false);
  const usesKm = kind === "trucks";

  if (isLoading) return <Loader />;

  return (
    <div className={ui.card}>
      <div className={ui.cardHeader}>
        <h2 className={ui.cardTitle}>Maintenance and regular checks</h2>
        <div className={styles.headerActions}>
          <button className={cx(ui.btn, ui.secondary, ui.small)} onClick={() => setChoosingChecklist(true)}>
            <FontAwesomeIcon icon={faListCheck} /> Add standard checklist
          </button>
          <button className={cx(ui.btn, ui.primary, ui.small)} onClick={() => setEditing("new")}>
            <FontAwesomeIcon icon={faPlus} /> Add check
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={faWrench}
          title="No checks scheduled"
          text="Add a standard checklist to track oil changes, inspections, brakes and tyres."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Check</th>
                <th>Last done</th>
                <th>Next due</th>
                <th>Status</th>
                <th className={ui.right}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Check">
                    <span>
                      <span className={ui.primaryText}>{item.title}</span>
                      <span className={ui.secondaryText}>{intervalText(item.intervalDays, item.intervalKm)}</span>
                    </span>
                  </td>
                  <td data-label="Last done">
                    <span>
                      <span>{item.lastDoneOn ? formatDate(item.lastDoneOn) : <span className={ui.muted}>Never recorded</span>}</span>
                      {item.lastDoneKm != null && <span className={ui.secondaryText}>{formatKm(item.lastDoneKm)}</span>}
                    </span>
                  </td>
                  <td data-label="Next due">
                    <span>
                      <span>
                        {[item.nextDueOn && formatDate(item.nextDueOn), item.nextDueKm != null && formatKm(item.nextDueKm)]
                          .filter(Boolean)
                          .join(" or ") || "–"}
                      </span>
                      <span className={ui.secondaryText}>{dueText(item)}</span>
                    </span>
                  </td>
                  <td data-label="Status">
                    <MaintenanceStatus item={item} />
                  </td>
                  <td data-label="" className={ui.right}>
                    <div className={ui.rowActions}>
                      <button className={cx(ui.btn, ui.secondary, ui.small)} onClick={() => setCompleting(item)}>
                        <FontAwesomeIcon icon={faCheck} /> Mark done
                      </button>
                      <IconButton icon={faPen} label={`Edit ${item.title}`} onClick={() => setEditing(item)} />
                      <IconButton icon={faTrash} label={`Delete ${item.title}`} danger onClick={() => setRemoving(item)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MaintenanceForm
          kind={kind}
          vehicleId={vehicleId}
          usesKm={usesKm}
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {completing && (
        <MarkDoneForm
          kind={kind}
          vehicleId={vehicleId}
          usesKm={usesKm}
          odometerKm={odometerKm}
          item={completing}
          onClose={() => setCompleting(undefined)}
        />
      )}
      {choosingChecklist && <ChecklistForm kind={kind} vehicleId={vehicleId} onClose={() => setChoosingChecklist(false)} />}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete "${removing.title}"?`}
          message="The check is removed from the schedule. Logbook entries stay."
          confirmLabel="Delete"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteItem({ kind, id: vehicleId, itemId: removing.id });
            setRemoving(undefined);
          }}
        />
      )}
    </div>
  );
};

const FormFooter = ({ form, busy, label, onClose }: { form: string; busy: boolean; label: string; onClose: () => void }) => (
  <>
    <button className={cx(ui.btn, ui.secondary)} onClick={onClose}>
      Cancel
    </button>
    <button className={cx(ui.btn, ui.primary)} type="submit" form={form} disabled={busy}>
      {busy ? "Saving..." : label}
    </button>
  </>
);

const MaintenanceForm = ({
  kind,
  vehicleId,
  usesKm,
  item,
  onClose,
}: Props & { usesKm: boolean; item?: MaintenanceItem; onClose: () => void }) => {
  const [save, saving] = useSaveMaintenanceMutation();
  const [values, setValues] = useState({
    title: item?.title ?? "",
    intervalDays: item?.intervalDays?.toString() ?? "",
    intervalKm: toInputValue(item?.intervalKm, kmToMiles),
    lastDoneOn: item?.lastDoneOn ?? "",
    lastDoneKm: toInputValue(item?.lastDoneKm, kmToMiles),
    notes: item?.notes ?? "",
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save({
        kind,
        id: vehicleId,
        itemId: item?.id,
        body: {
          title: values.title,
          intervalDays: numberOrNull(values.intervalDays),
          intervalKm: usesKm ? kmOrNull(values.intervalKm) : null,
          lastDoneOn: values.lastDoneOn || null,
          lastDoneKm: usesKm ? kmOrNull(values.lastDoneKm) : null,
          notes: values.notes,
        },
      }).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the check."));
    }
  };

  return (
    <Modal
      title={item ? "Edit check" : "Add check"}
      onClose={onClose}
      footer={<FormFooter form="maintenance-form" busy={saving.isLoading} label="Save check" onClose={onClose} />}
    >
      <form id="maintenance-form" className={ui.formGrid} onSubmit={submit}>
        {error && <div className={cx(ui.alert, ui.alertError, ui.fieldWide)}>{error}</div>}
        <label className={cx(ui.field, ui.fieldWide)}>
          <span className={ui.label}>
            What needs doing<span className={ui.required}>*</span>
          </span>
          <input className={ui.input} required value={values.title} onChange={set("title")} placeholder="e.g. Gearbox oil" />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Repeat every (days)</span>
          <input className={ui.input} type="number" min={1} value={values.intervalDays} onChange={set("intervalDays")} />
        </label>
        {usesKm && (
          <label className={ui.field}>
            <span className={ui.label}>Repeat every (mi)</span>
            <input className={ui.input} type="number" min={1} value={values.intervalKm} onChange={set("intervalKm")} />
          </label>
        )}
        <label className={ui.field}>
          <span className={ui.label}>Last done on</span>
          <input className={ui.input} type="date" value={values.lastDoneOn} onChange={set("lastDoneOn")} />
        </label>
        {usesKm && (
          <label className={ui.field}>
            <span className={ui.label}>Last done at (mi)</span>
            <input className={ui.input} type="number" min={0} value={values.lastDoneKm} onChange={set("lastDoneKm")} />
          </label>
        )}
        <label className={cx(ui.field, ui.fieldWide)}>
          <span className={ui.label}>Notes</span>
          <textarea className={ui.input} value={values.notes} onChange={set("notes")} />
        </label>
      </form>
    </Modal>
  );
};

const MarkDoneForm = ({
  kind,
  vehicleId,
  usesKm,
  odometerKm,
  item,
  onClose,
}: Props & { usesKm: boolean; item: MaintenanceItem; onClose: () => void }) => {
  const [markDone, saving] = useMarkMaintenanceDoneMutation();
  const [values, setValues] = useState({
    doneOn: todayIso(),
    odometerKm: toInputValue(odometerKm, kmToMiles),
    cost: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await markDone({
        kind,
        id: vehicleId,
        itemId: item.id,
        body: {
          doneOn: values.doneOn,
          ...(usesKm && values.odometerKm && { odometerKm: kmOrNull(values.odometerKm)! }),
          ...(values.cost && { cost: Number(values.cost), currency: "USD" }),
          notes: values.notes,
        },
      }).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save."));
    }
  };

  return (
    <Modal
      small
      title={`Mark "${item.title}" done`}
      onClose={onClose}
      footer={<FormFooter form="done-form" busy={saving.isLoading} label="Mark done" onClose={onClose} />}
    >
      <form id="done-form" className={ui.formGrid} onSubmit={submit}>
        {error && <div className={cx(ui.alert, ui.alertError, ui.fieldWide)}>{error}</div>}
        <p className={cx(ui.muted, ui.fieldWide, styles.hint)}>The next due date is recalculated and an entry is added to the logbook.</p>
        <label className={ui.field}>
          <span className={ui.label}>Done on</span>
          <input className={ui.input} type="date" required value={values.doneOn} onChange={set("doneOn")} />
        </label>
        {usesKm && (
          <label className={ui.field}>
            <span className={ui.label}>Odometer (mi)</span>
            <input className={ui.input} type="number" min={0} value={values.odometerKm} onChange={set("odometerKm")} />
          </label>
        )}
        <label className={ui.field}>
          <span className={ui.label}>Cost ($)</span>
          <input className={ui.input} type="number" min={0} step="0.01" value={values.cost} onChange={set("cost")} />
        </label>
        <label className={cx(ui.field, ui.fieldWide)}>
          <span className={ui.label}>Notes (workshop, parts, invoice number)</span>
          <textarea className={ui.input} value={values.notes} onChange={set("notes")} />
        </label>
      </form>
    </Modal>
  );
};

const ChecklistForm = ({ kind, vehicleId, onClose }: Props & { onClose: () => void }) => {
  const options = CHECKLISTS[kind];
  const [checklist, setChecklist] = useState(options[0].value);
  const [apply, applying] = useApplyChecklistMutation();
  const [result, setResult] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { added } = await apply({ kind, id: vehicleId, checklist }).unwrap();
      setResult(added ? `Added ${added} check${added === 1 ? "" : "s"}.` : "Every check from this list is already scheduled.");
    } catch (err) {
      setResult(apiErrorMessage(err, "Could not add the checklist."));
    }
  };

  return (
    <Modal
      small
      title="Add standard checklist"
      onClose={onClose}
      footer={
        result ? (
          <button className={cx(ui.btn, ui.primary)} onClick={onClose}>
            Done
          </button>
        ) : (
          <FormFooter form="checklist-form" busy={applying.isLoading} label="Add checks" onClose={onClose} />
        )
      }
    >
      {result ? (
        <p className={styles.hint}>{result} Set the "last done" date on each check so the next due date can be worked out.</p>
      ) : (
        <form id="checklist-form" className={styles.radioList} onSubmit={submit}>
          {options.map((option) => (
            <label key={option.value} className={styles.radio}>
              <input
                type="radio"
                name="checklist"
                value={option.value}
                checked={checklist === option.value}
                onChange={() => setChecklist(option.value)}
              />
              {option.label}
            </label>
          ))}
          <p className={cx(ui.muted, styles.hint)}>Only checks that aren't on the schedule yet are added.</p>
        </form>
      )}
    </Modal>
  );
};

export default MaintenanceTab;
