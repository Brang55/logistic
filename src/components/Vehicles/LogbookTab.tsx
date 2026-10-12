import { FormEvent, useState } from "react";
import { faBook, faTrash } from "@fortawesome/free-solid-svg-icons";

import {
  useAddLogEntryMutation,
  useDeleteLogEntryMutation,
  useVehicleLogQuery,
  type VehicleKind,
} from "../../app/api/vehicleRecords";
import { Loader } from "../Loader/Loader";
import { Badge, EmptyState, IconButton } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import { apiErrorMessage, formatDate, formatKm, formatMoney, LOG_KINDS, todayIso } from "./recordFormat";
import styles from "./VehicleDetail.module.css";
import { milesToKm } from "../../utils/units";

interface Props {
  kind: VehicleKind;
  vehicleId: string;
}

const emptyEntry = () => ({ entryDate: todayIso(), kind: "note", title: "", odometerKm: "", cost: "", notes: "" });

const LogbookTab = ({ kind, vehicleId }: Props) => {
  const { data: entries = [], isLoading } = useVehicleLogQuery({ kind, id: vehicleId });
  const [addEntry, adding] = useAddLogEntryMutation();
  const [deleteEntry] = useDeleteLogEntryMutation();
  const [values, setValues] = useState(emptyEntry);
  const [error, setError] = useState("");
  const usesKm = kind === "trucks";
  const set = (key: keyof ReturnType<typeof emptyEntry>) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await addEntry({
        kind,
        id: vehicleId,
        body: {
          entryDate: values.entryDate,
          kind: values.kind,
          title: values.title,
          // Entered in miles, stored in km.
          ...(usesKm && values.odometerKm && { odometerKm: Math.round(milesToKm(Number(values.odometerKm))) }),
          ...(values.cost && { cost: Number(values.cost), currency: "USD" }),
          notes: values.notes,
        },
      }).unwrap();
      setValues(emptyEntry());
    } catch (err) {
      setError(apiErrorMessage(err, "Could not add the entry."));
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className={styles.logbook}>
      <form className={cx(ui.card, styles.logForm)} onSubmit={submit}>
        <div className={ui.cardHeader}>
          <h2 className={ui.cardTitle}>New entry</h2>
        </div>
        <div className={cx(ui.cardBody, styles.logFields)}>
          {error && <div className={cx(ui.alert, ui.alertError)}>{error}</div>}
          <div className={styles.row2}>
            <label className={ui.field}>
              <span className={ui.label}>Date</span>
              <input className={ui.input} type="date" required value={values.entryDate} onChange={set("entryDate")} />
            </label>
            <label className={ui.field}>
              <span className={ui.label}>Kind</span>
              <select className={ui.input} value={values.kind} onChange={set("kind")}>
                {Object.entries(LOG_KINDS).map(([value, [label]]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={ui.field}>
            <span className={ui.label}>
              Title<span className={ui.required}>*</span>
            </span>
            <input
              className={ui.input}
              required
              value={values.title}
              onChange={set("title")}
              placeholder="e.g. Replaced left mirror"
            />
          </label>
          <div className={styles.row2}>
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
          </div>
          <label className={ui.field}>
            <span className={ui.label}>Notes</span>
            <textarea className={ui.input} value={values.notes} onChange={set("notes")} />
          </label>
          <button className={cx(ui.btn, ui.primary)} type="submit" disabled={adding.isLoading}>
            {adding.isLoading ? "Adding..." : "Add entry"}
          </button>
        </div>
      </form>

      <div className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.cardTitle}>Logbook</h2>
          <span className={ui.muted}>{entries.length} entries</span>
        </div>
        {entries.length === 0 ? (
          <EmptyState icon={faBook} title="Nothing logged yet" text="Services, repairs, damage and notes about this vehicle appear here." />
        ) : (
          <ol className={styles.timeline}>
            {entries.map((entry) => {
              const [label, tone] = LOG_KINDS[entry.kind] ?? [entry.kind, "neutral"];
              const details = [
                entry.odometerKm != null && formatKm(entry.odometerKm),
                formatMoney(entry.cost, entry.currency),
                entry.authorEmail,
              ].filter(Boolean);
              return (
                <li key={entry.id} className={styles.entry}>
                  <span className={cx(styles.entryDot, styles[`dot-${tone}`])} />
                  <div className={styles.entryBody}>
                    <div className={styles.entryTop}>
                      <span className={styles.entryDate}>{formatDate(entry.entryDate)}</span>
                      <Badge tone={tone}>{label}</Badge>
                      <IconButton icon={faTrash} label={`Delete ${entry.title}`} danger onClick={() => deleteEntry({ kind, id: vehicleId, entryId: entry.id })} />
                    </div>
                    <span className={ui.primaryText}>{entry.title}</span>
                    {entry.notes && <p className={styles.entryNotes}>{entry.notes}</p>}
                    {details.length > 0 && <span className={ui.secondaryText}>{details.join(" · ")}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};

export default LogbookTab;
