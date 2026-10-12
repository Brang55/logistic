import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Proposal, ToolInput } from "./assistant.types";

const CONVERSATION_TTL_MS = 30 * 60_000;
const ACTION_TTL_MS = 10 * 60_000;
// Past this the conversation starts over: history is only ever appended to, never trimmed.
const MAX_MESSAGES = 60;

export interface Conversation {
  id: string;
  userId: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  /** What the user did with proposed actions since the last message, told to Claude next turn. */
  notes: string[];
  touchedAt: number;
}

export interface PendingAction {
  id: string;
  userId: string;
  conversationId: string;
  tool: string;
  input: ToolInput;
  proposal: Proposal;
  expiresAt: number;
}

/**
 * Conversations and proposed actions waiting for the user's confirmation.
 * (In memory per API instance, like live alerts; they only need to outlive one exchange.)
 */
@Injectable()
export class AssistantStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly actions = new Map<string, PendingAction>();

  /** The user's conversation, or a new one when it is unknown, someone else's, expired or full. */
  conversation(userId: string, id?: string): Conversation {
    this.sweep();
    const existing = id ? this.conversations.get(id) : undefined;
    if (existing && existing.userId === userId && existing.messages.length < MAX_MESSAGES) {
      existing.touchedAt = Date.now();
      return existing;
    }
    const conversation: Conversation = { id: randomUUID(), userId, messages: [], notes: [], touchedAt: Date.now() };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  propose(action: Omit<PendingAction, "id" | "expiresAt">): PendingAction {
    const pending = { ...action, id: randomUUID(), expiresAt: Date.now() + ACTION_TTL_MS };
    this.actions.set(pending.id, pending);
    return pending;
  }

  /** A pending action of this user that hasn't expired. */
  action(userId: string, id: string): PendingAction | undefined {
    this.sweep();
    const action = this.actions.get(id);
    return action?.userId === userId ? action : undefined;
  }

  /** Removes the action and tells Claude about the outcome on the next turn. */
  settle(action: PendingAction, note: string) {
    this.actions.delete(action.id);
    this.conversations.get(action.conversationId)?.notes.push(note);
  }

  /** Withdraws the conversation's unanswered proposals, so only the latest ones can be confirmed. */
  withdrawPending(conversationId: string) {
    for (const action of [...this.actions.values()]) {
      if (action.conversationId === conversationId) {
        this.settle(action, `The user moved on without confirming "${action.proposal.summary}"; it was withdrawn and not done.`);
      }
    }
  }

  private sweep() {
    const now = Date.now();
    for (const [id, action] of this.actions) if (action.expiresAt < now) this.actions.delete(id);
    for (const [id, c] of this.conversations) if (c.touchedAt + CONVERSATION_TTL_MS < now) this.conversations.delete(id);
  }
}
