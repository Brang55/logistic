import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments, faPaperPlane, faPhone, faUsers } from "@fortawesome/free-solid-svg-icons";

import {
  useChatMessagesQuery,
  useDriverDirectoryQuery,
  useSendChatMessageMutation,
  type ChatMessage,
  type DirectoryDriver,
} from "../../app/api/community";
import { useMyTripQuery } from "../../app/api/trips";
import { Loader } from "../Loader/Loader";
import { PageHeader } from "../ui/ui";
import { cx, initials, matches } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import { formatClock } from "./driverFormat";
import { useMediaQuery, WIDE_QUERY } from "./useMediaQuery";

import shared from "./driver.module.css";
import styles from "./DriverChat.module.css";
import { errorMessage } from "../../utils/errors";

// Messages from the same driver within this window are grouped under one name.
const GROUP_MS = 5 * 60 * 1000;

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
};

const CallLink = ({ phone, name, compact }: { phone: string; name: string; compact?: boolean }) =>
  phone ? (
    <a href={`tel:${phone.replace(/\s+/g, "")}`} className={compact ? styles.callIcon : shared.callButton} aria-label={`Call ${name}`}>
      <FontAwesomeIcon icon={faPhone} />
      {!compact && <span>Call</span>}
    </a>
  ) : null;

const Messages = ({ messages, myId }: { messages: ChatMessage[]; myId?: string }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1]?.id;
  // Keep the newest message in view; only the message list scrolls, not the page.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [last]);

  if (!messages.length) {
    return <p className={cx(shared.muted, shared.emptyList)}>No messages yet. Say hello to the other drivers!</p>;
  }
  return (
    <div className={shared.messages} ref={listRef}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
        const grouped =
          !newDay &&
          previous.sender.driverId === message.sender.driverId &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_MS;
        const mine = message.sender.driverId === myId;
        const [first, ...rest] = message.sender.name.split(" ");
        return (
          <div key={message.id}>
            {newDay && <div className={styles.daySeparator}>{dayLabel(message.createdAt)}</div>}
            <div className={cx(styles.message, mine && styles.messageMine, grouped && styles.messageGrouped)}>
              {!mine && <span className={cx(shared.avatar, styles.chatAvatar, grouped && styles.hidden)}>{initials(first, rest.join(" "))}</span>}
              <div className={styles.messageBody}>
                {!grouped && (
                  <div className={styles.messageMeta}>
                    <strong>{mine ? "You" : message.sender.name}</strong>
                    {message.sender.truckNumber && <span>{message.sender.truckNumber}</span>}
                    <span>{formatClock(message.createdAt)}</span>
                    {!mine && <CallLink phone={message.sender.phoneNumber} name={message.sender.name} compact />}
                  </div>
                )}
                <p className={styles.messageText}>{message.body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Composer = () => {
  const [send, sending] = useSendChatMessageMutation();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    const result = await send(body);
    if ("error" in result) return setError(errorMessage(result.error));
    setText("");
  };

  // Enter sends; Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form className={shared.composer} onSubmit={submit}>
      {error && <p className={shared.formError}>{error}</p>}
      <div className={styles.composerRow}>
        <textarea
          className={cx(ui.input, styles.composerInput)}
          rows={1}
          maxLength={1000}
          placeholder="Write to all drivers"
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className={shared.sendButton} type="submit" disabled={!text.trim() || sending.isLoading} aria-label="Send message">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>
    </form>
  );
};

const Contacts = ({ drivers, myId }: { drivers: DirectoryDriver[]; myId?: string }) => {
  const [search, setSearch] = useState("");
  const others = drivers.filter((d) => d.id !== myId && matches(search, d.firstName, d.lastName, d.truckNumber));
  return (
    <section className={cx(shared.card, shared.contactsCard)}>
      <div className={shared.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faUsers} /> Drivers
        </h2>
        <span className={shared.ref}>{drivers.length - (myId ? 1 : 0)} colleagues</span>
      </div>
      <input
        className={ui.input}
        type="search"
        placeholder="Search name or truck"
        aria-label="Search drivers"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className={styles.contactList}>
        {others.map((driver) => (
          <li key={driver.id}>
            <span className={shared.avatar}>{initials(driver.firstName, driver.lastName)}</span>
            <span className={shared.contactText}>
              <strong>
                {driver.firstName} {driver.lastName}
              </strong>
              <span className={shared.muted}>
                {[driver.truckNumber, driver.status === "taken" ? "On a trip" : "Available"].filter(Boolean).join(" · ")}
              </span>
              {driver.phoneNumber && <span className={styles.phone}>{driver.phoneNumber}</span>}
            </span>
            <CallLink phone={driver.phoneNumber} name={driver.firstName} />
          </li>
        ))}
        {others.length === 0 && <li className={shared.muted}>No drivers match.</li>}
      </ul>
    </section>
  );
};

const DriverChat = () => {
  const { data: messages = [], isLoading } = useChatMessagesQuery();
  const { data: drivers = [] } = useDriverDirectoryQuery();
  const { data: me } = useMyTripQuery();
  const wide = useMediaQuery(WIDE_QUERY);
  const [tab, setTab] = useState<"chat" | "contacts">("chat");
  const myId = me?.driver.id;
  const participants = useMemo(() => new Set(messages.map((m) => m.sender.driverId)).size, [messages]);

  if (isLoading) return <Loader />;

  const chat = (
    <section className={cx(shared.card, styles.chatCard)}>
      <div className={shared.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faComments} /> Drivers' chat
        </h2>
        <span className={shared.ref}>{participants} drivers talking</span>
      </div>
      <Messages messages={messages} myId={myId} />
      <Composer />
    </section>
  );
  const contacts = <Contacts drivers={drivers} myId={myId} />;

  return (
    <div className={shared.page}>
      <PageHeader
        eyebrow="Community"
        title="Chat & contacts"
        subtitle="Ask other drivers for advice, or call them directly"
        actions={
          !wide && (
            <div className={shared.segmented} role="tablist">
              {(["chat", "contacts"] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  className={cx(shared.segment, tab === value && shared.segmentActive)}
                  onClick={() => setTab(value)}
                >
                  {value === "chat" ? "Chat" : "Contacts"}
                </button>
              ))}
            </div>
          )
        }
      />

      {wide ? (
        <div className={styles.chatLayout}>
          {chat}
          {contacts}
        </div>
      ) : tab === "chat" ? (
        chat
      ) : (
        contacts
      )}
    </div>
  );
};

export default DriverChat;
