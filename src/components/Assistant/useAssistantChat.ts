import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useCancelAssistantActionMutation,
  useConfirmAssistantActionMutation,
  useSendAssistantMessageMutation,
  type ProposedAction,
  type UiAction,
} from "../../app/api/assistant";
import { speak, spokenPart } from "../../hooks/useSpeech";
import { errorMessage } from "../../utils/errors";

export type ActionState =
  | { status: "pending"; error?: string }
  | { status: "done"; message: string; link?: UiAction }
  | { status: "cancelled" | "expired" | "withdrawn" };

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "reply"; text: string; error?: boolean }
  | { kind: "event"; text: string }
  | { kind: "action"; action: ProposedAction; state: ActionState };

// The API refuses a truck whose route breaks height or weight limits until the user accepts them.
const restrictionsIn = (error: unknown) => {
  const { status, data } = (error ?? {}) as { status?: number; data?: { code?: string; violations?: string[] } };
  return status === 409 && data?.code === "ROUTE_RESTRICTIONS" ? (data.violations ?? []) : undefined;
};

const isGone = (error: unknown) => (error as { status?: number } | undefined)?.status === 404;

/**
 * One conversation with the assistant: messages, proposed actions and their outcome.
 * Replies to spoken requests, and the outcome of actions proposed from them, are read aloud.
 */
export const useAssistantChat = ({ onNavigate }: { onNavigate?: (path: string) => void } = {}) => {
  const navigate = useNavigate();
  // The latest callback, so pages opened after an earlier render still reach it.
  const navigated = useRef(onNavigate);
  navigated.current = onNavigate;
  const location = useLocation();
  const [send, sending] = useSendAssistantMessageMutation();
  const [confirmAction, confirming] = useConfirmAssistantActionMutation();
  const [cancelAction] = useCancelAssistantActionMutation();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [spokenActions, setSpokenActions] = useState<Set<string>>(new Set());
  const [restrictions, setRestrictions] = useState<{ action: ProposedAction; violations: string[]; error?: string }>();

  const add = (...more: Entry[]) => setEntries((list) => [...list, ...more]);
  const updateAction = (id: string, state: ActionState) =>
    setEntries((list) => list.map((e) => (e.kind === "action" && e.action.id === id ? { ...e, state } : e)));

  const open = (action: UiAction) => {
    navigate(action.path);
    add({ kind: "event", text: `Opened ${action.label}` });
    navigated.current?.(action.path);
  };

  const submit = async (message: string, spoken = false) => {
    const trimmed = message.trim();
    if (!trimmed || sending.isLoading) return;
    // The server withdraws proposals left unconfirmed when a new request comes in.
    setEntries((list) => [
      ...list.map((e): Entry => (e.kind === "action" && e.state.status === "pending" ? { ...e, state: { status: "withdrawn" } } : e)),
      { kind: "user", text: trimmed },
    ]);
    const result = await send({ text: trimmed, conversationId, page: location.pathname + location.search });
    if ("error" in result) {
      const text = errorMessage(result.error);
      add({ kind: "reply", text, error: true });
      if (spoken) speak(text);
      return;
    }
    const { reply, actions, ui } = result.data;
    setConversationId(result.data.conversationId);
    add(
      { kind: "reply", text: reply },
      ...actions.map((action): Entry => ({ kind: "action", action, state: { status: "pending" } }))
    );
    ui.forEach(open);
    if (spoken) {
      speak(spokenPart(reply));
      setSpokenActions((ids) => new Set([...ids, ...actions.map((a) => a.id)]));
    }
  };

  const confirm = async (action: ProposedAction, acceptRestrictions = false) => {
    const result = await confirmAction({ id: action.id, acceptRestrictions });
    if ("data" in result) {
      setRestrictions(undefined);
      updateAction(action.id, { status: "done", ...result.data });
      if (spokenActions.has(action.id)) speak(result.data.message);
      return;
    }
    const violations = restrictionsIn(result.error);
    if (violations) {
      setRestrictions({ action, violations });
    } else if (isGone(result.error)) {
      setRestrictions(undefined);
      updateAction(action.id, { status: "expired" });
    } else if (restrictions) {
      setRestrictions({ ...restrictions, error: errorMessage(result.error, "Could not assign the truck.") });
    } else {
      updateAction(action.id, { status: "pending", error: errorMessage(result.error) });
    }
  };

  const cancel = async (action: ProposedAction) => {
    updateAction(action.id, { status: "cancelled" });
    // Already expired on the server is just as good as cancelled.
    await cancelAction(action.id);
  };

  const restart = () => {
    setEntries([]);
    setConversationId(undefined);
  };

  return {
    entries,
    submit,
    confirm,
    cancel,
    restart,
    open,
    sending: sending.isLoading,
    confirming: confirming.isLoading,
    restrictions,
    dismissRestrictions: () => setRestrictions(undefined),
    /** A link in a reply was followed. */
    navigated: (path: string) => navigated.current?.(path),
  };
};
