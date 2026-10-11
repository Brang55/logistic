import { api } from "./base";

/** Something the app does for the user, such as opening a page. */
export interface UiAction {
  type: "navigate";
  path: string;
  label: string;
}

/** A change the assistant proposed; nothing happens until the user confirms it. */
export interface ProposedAction {
  id: string;
  tool: string;
  title: string;
  summary: string;
  details: string[];
  warnings: string[];
  expiresAt: string;
}

export interface AssistantReply {
  conversationId: string;
  reply: string;
  actions: ProposedAction[];
  ui: UiAction[];
}

export interface AssistantMessage {
  text: string;
  conversationId?: string;
  page?: string;
}

export interface ActionResult {
  message: string;
  link?: UiAction;
}

const assistantApi = api.injectEndpoints({
  endpoints: (builder) => ({
    assistantStatus: builder.query<{ enabled: boolean; model: string | null }, void>({
      query: () => "/assistant",
    }),
    sendAssistantMessage: builder.mutation<AssistantReply, AssistantMessage>({
      query: (body) => ({ url: "/assistant/message", method: "POST", body }),
    }),
    // A confirmed action can create, edit, assign or confirm cargo, so every page showing those refreshes.
    confirmAssistantAction: builder.mutation<ActionResult, { id: string; acceptRestrictions?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/assistant/actions/${id}/confirm`, method: "POST", body }),
      invalidatesTags: [
        "Cargo",
        "Driver",
        "AvailableDrivers",
        "Truck",
        "AvailableTrucks",
        "Trailer",
        "AvailableTrailers",
        "Traffic",
        "NextPickups",
      ],
    }),
    cancelAssistantAction: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/assistant/actions/${id}/cancel`, method: "POST" }),
    }),
  }),
});

export const {
  useAssistantStatusQuery,
  useSendAssistantMessageMutation,
  useConfirmAssistantActionMutation,
  useCancelAssistantActionMutation,
} = assistantApi;
