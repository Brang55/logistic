import { FormEvent, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileLines, faPaperclip, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteDocumentMutation,
  useDocumentFileUrlMutation,
  useSaveDocumentMutation,
  useVehicleDocumentsQuery,
  type VehicleDocument,
  type VehicleKind,
} from "../../app/features/driver/vehicleRecordsSlice";
import { Loader } from "../Loader/Loader";
import { ConfirmDialog, EmptyState, IconButton, Modal } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import { DocumentStatus } from "./records";
import { apiErrorMessage, DOCUMENT_TYPES, formatDate, NEW_DOCUMENT_TYPES } from "./recordFormat";
import styles from "./VehicleDetail.module.css";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_BYTES = 10 * 1024 * 1024;

const fileSize = (bytes: number | null) =>
  bytes == null ? "" : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface Props {
  kind: VehicleKind;
  vehicleId: string;
}

const DocumentsTab = ({ kind, vehicleId }: Props) => {
  const { data: documents = [], isLoading } = useVehicleDocumentsQuery({ kind, id: vehicleId });
  const [deleteDocument, deleting] = useDeleteDocumentMutation();
  const [fileUrl] = useDocumentFileUrlMutation();
  const [editing, setEditing] = useState<VehicleDocument | "new">();
  const [removing, setRemoving] = useState<VehicleDocument>();
  const [openError, setOpenError] = useState("");

  const openFile = async (doc: VehicleDocument) => {
    setOpenError("");
    // Open the tab during the click so the browser doesn't block it as a pop-up.
    const viewer = window.open("", "_blank");
    try {
      const url = await fileUrl(doc.id).unwrap();
      if (viewer) viewer.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      viewer?.close();
      setOpenError(`Could not open ${doc.fileName ?? "the file"}.`);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className={ui.card}>
      <div className={ui.cardHeader}>
        <h2 className={ui.cardTitle}>Documents</h2>
        <button className={cx(ui.btn, ui.primary, ui.small)} onClick={() => setEditing("new")}>
          <FontAwesomeIcon icon={faPlus} /> Add document
        </button>
      </div>
      {openError && <div className={cx(ui.alert, ui.alertError, styles.inlineAlert)}>{openError}</div>}

      {documents.length === 0 ? (
        <EmptyState
          icon={faFileLines}
          title="No documents yet"
          text="Add the registration, insurance and inspection certificates, with their expiry dates and scans."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Number</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>File</th>
                <th className={ui.right}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td data-label="Document">
                    <span>
                      <span className={ui.primaryText}>{doc.title || DOCUMENT_TYPES[doc.type]}</span>
                      <span className={ui.secondaryText}>{DOCUMENT_TYPES[doc.type] ?? doc.type}</span>
                    </span>
                  </td>
                  <td data-label="Number" className={ui.muted}>
                    {doc.number || "–"}
                  </td>
                  <td data-label="Issued" className={ui.muted}>
                    {formatDate(doc.issuedOn)}
                  </td>
                  <td data-label="Expires">
                    <span className={styles.stack}>
                      <span>{formatDate(doc.expiresOn)}</span>
                      <DocumentStatus doc={doc} />
                    </span>
                  </td>
                  <td data-label="File">
                    {doc.hasFile ? (
                      <button className={styles.fileLink} onClick={() => openFile(doc)} title={`Open ${doc.fileName}`}>
                        <FontAwesomeIcon icon={faPaperclip} />
                        <span>{doc.fileName}</span>
                      </button>
                    ) : (
                      <span className={ui.muted}>No file</span>
                    )}
                  </td>
                  <td data-label="" className={ui.right}>
                    <div className={ui.rowActions}>
                      <IconButton icon={faPen} label={`Edit ${doc.title}`} onClick={() => setEditing(doc)} />
                      <IconButton icon={faTrash} label={`Delete ${doc.title}`} danger onClick={() => setRemoving(doc)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <DocumentForm
          kind={kind}
          vehicleId={vehicleId}
          doc={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {removing && (
        <ConfirmDialog
          danger
          title={`Delete ${removing.title || DOCUMENT_TYPES[removing.type]}?`}
          message={removing.hasFile ? "The document and its attached file are deleted." : "The document is deleted."}
          confirmLabel="Delete"
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteDocument({ kind, id: vehicleId, docId: removing.id });
            setRemoving(undefined);
          }}
        />
      )}
    </div>
  );
};

const DocumentForm = ({ kind, vehicleId, doc, onClose }: Props & { doc?: VehicleDocument; onClose: () => void }) => {
  const [save, saving] = useSaveDocumentMutation();
  const [values, setValues] = useState({
    type: doc?.type ?? "insurance",
    title: doc?.title ?? "",
    number: doc?.number ?? "",
    issuedOn: doc?.issuedOn ?? "",
    expiresOn: doc?.expiresOn ?? "",
    notes: doc?.notes ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (file && file.size > MAX_BYTES) return setError("Files can be at most 10 MB.");
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => form.append(key, value));
    if (file) form.append("file", file);
    else if (removeFile) form.append("removeFile", "true");
    try {
      await save({ kind, id: vehicleId, docId: doc?.id, form }).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the document."));
    }
  };

  return (
    <Modal
      title={doc ? "Edit document" : "Add document"}
      onClose={onClose}
      footer={
        <>
          <button className={cx(ui.btn, ui.secondary)} onClick={onClose}>
            Cancel
          </button>
          <button className={cx(ui.btn, ui.primary)} type="submit" form="document-form" disabled={saving.isLoading}>
            {saving.isLoading ? "Saving..." : "Save document"}
          </button>
        </>
      }
    >
      <form id="document-form" className={ui.formGrid} onSubmit={submit}>
        {error && <div className={cx(ui.alert, ui.alertError, ui.fieldWide)}>{error}</div>}
        <label className={ui.field}>
          <span className={ui.label}>Type</span>
          <select className={ui.input} value={values.type} onChange={set("type")}>
            {NEW_DOCUMENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Title</span>
          <input className={ui.input} value={values.title} onChange={set("title")} placeholder={DOCUMENT_TYPES[values.type]} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Document number</span>
          <input className={ui.input} value={values.number} onChange={set("number")} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Issued on</span>
          <input className={ui.input} type="date" value={values.issuedOn} onChange={set("issuedOn")} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Expires on</span>
          <input className={ui.input} type="date" value={values.expiresOn} onChange={set("expiresOn")} />
        </label>
        <label className={cx(ui.field, ui.fieldWide)}>
          <span className={ui.label}>Scan or photo (PDF or image, max 10 MB)</span>
          <input
            className={ui.input}
            type="file"
            accept={ACCEPT}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
            }}
          />
          {doc?.hasFile && !file && (
            <span className={styles.currentFile}>
              <span>
                Current file: {doc.fileName} {fileSize(doc.fileSize) && `(${fileSize(doc.fileSize)})`}
              </span>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={removeFile} onChange={(event) => setRemoveFile(event.target.checked)} />
                Remove file
              </label>
            </span>
          )}
        </label>
        <label className={cx(ui.field, ui.fieldWide)}>
          <span className={ui.label}>Notes</span>
          <textarea className={ui.input} value={values.notes} onChange={set("notes")} />
        </label>
      </form>
    </Modal>
  );
};

export default DocumentsTab;
