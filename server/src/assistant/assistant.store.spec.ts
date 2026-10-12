import { AssistantStore } from "./assistant.store";

describe("AssistantStore", () => {
  let store: AssistantStore;
  const proposal = { title: "Confirm load", summary: "Confirm SH-ABC123", details: [], warnings: [] };

  beforeEach(() => {
    jest.useFakeTimers();
    store = new AssistantStore();
  });
  afterEach(() => jest.useRealTimers());

  const propose = (userId = "u1") => {
    const conversation = store.conversation(userId);
    return { conversation, action: store.propose({ userId, conversationId: conversation.id, tool: "confirm_cargo", input: {}, proposal }) };
  };

  it("keeps a conversation per user and starts a new one for anyone else", () => {
    const mine = store.conversation("u1");
    expect(store.conversation("u1", mine.id)).toBe(mine);
    expect(store.conversation("u2", mine.id)).not.toBe(mine);
  });

  it("only gives an action back to the user who asked for it", () => {
    const { action } = propose();
    expect(store.action("u1", action.id)).toBe(action);
    expect(store.action("u2", action.id)).toBeUndefined();
  });

  it("forgets actions after ten minutes", () => {
    const { action } = propose();
    jest.advanceTimersByTime(10 * 60_000 + 1);
    expect(store.action("u1", action.id)).toBeUndefined();
  });

  it("withdraws a conversation's open proposals and says so next turn", () => {
    const { conversation, action } = propose();
    const other = propose("u2").action;
    store.withdrawPending(conversation.id);
    expect(store.action("u1", action.id)).toBeUndefined();
    expect(store.action("u2", other.id)).toBe(other);
    expect(conversation.notes).toEqual(['The user moved on without confirming "Confirm SH-ABC123"; it was withdrawn and not done.']);
  });

  it("settling removes the action and leaves a note for the next turn", () => {
    const { conversation, action } = propose();
    store.settle(action, "The user cancelled it");
    expect(store.action("u1", action.id)).toBeUndefined();
    expect(conversation.notes).toEqual(["The user cancelled it"]);
  });
});
