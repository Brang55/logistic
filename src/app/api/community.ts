import { api } from "./base";
import type { ResourceStatus } from "../../utils/status";
import { acquireLiveSocket } from "../liveSocket";
import type { LngLat } from "./routing";

export type ReportType = "traffic" | "accident" | "police" | "roadworks" | "hazard" | "closure" | "weather" | "border";

export interface RoadReport {
  id: string;
  type: ReportType;
  label: string;
  point: LngLat;
  note: string;
  createdAt: string;
  expiresAt: string;
  reporter: { driverId: string; name: string; truckNumber: string | null };
}

export interface RoadReports {
  /** The asking driver's truck position, for distances. */
  position: LngLat | null;
  reports: RoadReport[];
}

export interface DeliveryHistory {
  total: number;
  deliveries: {
    id: string;
    pickupLocation: string;
    deliveryLocation: string;
    descriptionOfGoods: string;
    weight: string;
    quantity: string;
    shipperName: string;
    receiverName: string;
    deliveryDate: string;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    delayMinutes: number | null;
    truckNumber: string | null;
  }[];
}

export interface DirectoryDriver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  truckNumber: string | null;
  status: ResourceStatus;
  usesApp: boolean;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  sender: { driverId: string; name: string; phoneNumber: string; truckNumber: string | null };
}

type ReportEvent = RoadReport | { id: string; removed: true };

const upsertReport = (data: RoadReports, report: RoadReport) => {
  data.reports = [report, ...data.reports.filter((r) => r.id !== report.id)];
};

export const communityApi = api.injectEndpoints({
  endpoints: (builder) => ({
    roadReports: builder.query<RoadReports, void>({
      query: () => "/road-reports",
      providesTags: ["RoadReports"],
      // Reports from other drivers arrive over the live socket.
      async onCacheEntryAdded(_arg, { updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const [socket, release] = acquireLiveSocket();
        const onReport = (event: ReportEvent) =>
          updateCachedData((data) => {
            if ("removed" in event) data.reports = data.reports.filter((r) => r.id !== event.id);
            else upsertReport(data, event);
          });
        socket.on("road-report", onReport);
        await cacheEntryRemoved;
        socket.off("road-report", onReport);
        release();
      },
    }),
    createRoadReport: builder.mutation<RoadReport, { type: ReportType; note?: string }>({
      query: (body) => ({ url: "/road-reports", method: "POST", body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: undefined }));
        if (data) dispatch(communityApi.util.updateQueryData("roadReports", undefined, (draft) => upsertReport(draft, data)));
      },
    }),
    deleteRoadReport: builder.mutation<void, string>({
      query: (id) => ({ url: `/road-reports/${id}`, method: "DELETE" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        await queryFulfilled.catch(() => undefined);
        dispatch(
          communityApi.util.updateQueryData("roadReports", undefined, (draft) => {
            draft.reports = draft.reports.filter((r) => r.id !== id);
          })
        );
      },
    }),

    deliveryHistory: builder.query<DeliveryHistory, void>({
      query: () => "/me/history",
      providesTags: ["DeliveryHistory"],
    }),

    driverDirectory: builder.query<DirectoryDriver[], void>({
      query: () => "/community/drivers",
    }),
    chatMessages: builder.query<ChatMessage[], void>({
      query: () => "/community/messages",
      async onCacheEntryAdded(_arg, { updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const [socket, release] = acquireLiveSocket();
        const onMessage = (message: ChatMessage) =>
          updateCachedData((messages) => {
            if (!messages.some((m) => m.id === message.id)) messages.push(message);
          });
        socket.on("chat-message", onMessage);
        await cacheEntryRemoved;
        socket.off("chat-message", onMessage);
        release();
      },
    }),
    sendChatMessage: builder.mutation<ChatMessage, string>({
      query: (body) => ({ url: "/community/messages", method: "POST", body: { body } }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: undefined }));
        if (!data) return;
        dispatch(
          communityApi.util.updateQueryData("chatMessages", undefined, (messages) => {
            if (!messages.some((m) => m.id === data.id)) messages.push(data);
          })
        );
      },
    }),
  }),
});

export const {
  useRoadReportsQuery,
  useCreateRoadReportMutation,
  useDeleteRoadReportMutation,
  useDeliveryHistoryQuery,
  useDriverDirectoryQuery,
  useChatMessagesQuery,
  useSendChatMessageMutation,
} = communityApi;
