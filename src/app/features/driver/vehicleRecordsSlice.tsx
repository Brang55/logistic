import { api } from "../../api";

export type VehicleKind = "trucks" | "trailers";

export interface VehicleDocument {
  id: string;
  type: string;
  title: string;
  number: string;
  issuedOn: string | null;
  expiresOn: string | null;
  notes: string;
  hasFile: boolean;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  status: "expired" | "expiring" | "valid" | "no_expiry";
  daysLeft: number | null;
}

export interface MaintenanceItem {
  id: string;
  type: string;
  title: string;
  intervalDays: number | null;
  intervalKm: number | null;
  lastDoneOn: string | null;
  lastDoneKm: number | null;
  notes: string;
  status: "overdue" | "due_soon" | "ok" | "not_started";
  nextDueOn: string | null;
  nextDueKm: number | null;
  daysLeft: number | null;
  kmLeft: number | null;
}

export interface LogEntry {
  id: string;
  entryDate: string;
  kind: "service" | "repair" | "inspection" | "damage" | "note";
  title: string;
  odometerKm: number | null;
  cost: number | null;
  currency: string | null;
  notes: string;
  maintenanceItemId: string | null;
  authorEmail: string | null;
  createdAt: string;
}

export interface AttentionItem {
  kind: VehicleKind;
  vehicleId: string;
  vehicleLabel: string;
  recordType: "document" | "maintenance";
  recordId: string;
  title: string;
  status: "expired" | "expiring" | "overdue" | "due_soon";
  dueOn: string | null;
  daysLeft: number | null;
  kmLeft: number | null;
}

interface VehicleRef {
  kind: VehicleKind;
  id: string;
}

// Records change the fleet attention list (and, via the logbook, a truck's odometer).
const RECORD_TAGS = ["Attention", "Truck"] as const;

export const vehicleRecordsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    vehicleDocuments: builder.query<VehicleDocument[], VehicleRef>({
      query: ({ kind, id }) => `/${kind}/${id}/documents`,
      providesTags: ["VehicleDocs"],
    }),
    saveDocument: builder.mutation<VehicleDocument, VehicleRef & { docId?: string; form: FormData }>({
      query: ({ kind, id, docId, form }) => ({
        url: docId ? `/${kind}/${id}/documents/${docId}` : `/${kind}/${id}/documents`,
        method: docId ? "PATCH" : "POST",
        body: form,
      }),
      invalidatesTags: ["VehicleDocs", ...RECORD_TAGS],
    }),
    deleteDocument: builder.mutation<void, VehicleRef & { docId: string }>({
      query: ({ kind, id, docId }) => ({ url: `/${kind}/${id}/documents/${docId}`, method: "DELETE" }),
      invalidatesTags: ["VehicleDocs", ...RECORD_TAGS],
    }),

    maintenance: builder.query<MaintenanceItem[], VehicleRef>({
      query: ({ kind, id }) => `/${kind}/${id}/maintenance`,
      providesTags: ["Maintenance"],
    }),
    saveMaintenance: builder.mutation<MaintenanceItem, VehicleRef & { itemId?: string; body: Record<string, unknown> }>({
      query: ({ kind, id, itemId, body }) => ({
        url: itemId ? `/${kind}/${id}/maintenance/${itemId}` : `/${kind}/${id}/maintenance`,
        method: itemId ? "PATCH" : "POST",
        body,
      }),
      invalidatesTags: ["Maintenance", ...RECORD_TAGS],
    }),
    deleteMaintenance: builder.mutation<void, VehicleRef & { itemId: string }>({
      query: ({ kind, id, itemId }) => ({ url: `/${kind}/${id}/maintenance/${itemId}`, method: "DELETE" }),
      invalidatesTags: ["Maintenance", ...RECORD_TAGS],
    }),
    markMaintenanceDone: builder.mutation<MaintenanceItem, VehicleRef & { itemId: string; body: Record<string, unknown> }>({
      query: ({ kind, id, itemId, body }) => ({ url: `/${kind}/${id}/maintenance/${itemId}/done`, method: "POST", body }),
      invalidatesTags: ["Maintenance", "VehicleLog", ...RECORD_TAGS],
    }),
    applyChecklist: builder.mutation<{ added: number }, VehicleRef & { checklist: string }>({
      query: ({ kind, id, checklist }) => ({ url: `/${kind}/${id}/maintenance/checklist`, method: "POST", body: { checklist } }),
      invalidatesTags: ["Maintenance", ...RECORD_TAGS],
    }),

    vehicleLog: builder.query<LogEntry[], VehicleRef>({
      query: ({ kind, id }) => `/${kind}/${id}/log`,
      providesTags: ["VehicleLog"],
    }),
    addLogEntry: builder.mutation<LogEntry, VehicleRef & { body: Record<string, unknown> }>({
      query: ({ kind, id, body }) => ({ url: `/${kind}/${id}/log`, method: "POST", body }),
      invalidatesTags: ["VehicleLog", ...RECORD_TAGS],
    }),
    deleteLogEntry: builder.mutation<void, VehicleRef & { entryId: string }>({
      query: ({ kind, id, entryId }) => ({ url: `/${kind}/${id}/log/${entryId}`, method: "DELETE" }),
      invalidatesTags: ["VehicleLog"],
    }),

    // Downloads need the access token, so the scan is fetched through the API (which refreshes
    // expired tokens) and handed back as a temporary blob URL.
    documentFileUrl: builder.mutation<string, string>({
      query: (docId) => ({
        url: `/vehicle-documents/${docId}/file`,
        responseHandler: async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : response.text()),
      }),
    }),

    fleetAttention: builder.query<AttentionItem[], void>({
      query: () => "/fleet/attention",
      providesTags: ["Attention"],
    }),
  }),
});

export const {
  useVehicleDocumentsQuery,
  useSaveDocumentMutation,
  useDeleteDocumentMutation,
  useMaintenanceQuery,
  useSaveMaintenanceMutation,
  useDeleteMaintenanceMutation,
  useMarkMaintenanceDoneMutation,
  useApplyChecklistMutation,
  useVehicleLogQuery,
  useAddLogEntryMutation,
  useDeleteLogEntryMutation,
  useDocumentFileUrlMutation,
  useFleetAttentionQuery,
} = vehicleRecordsApi;
