export { formatCargoWeight as formatWeight } from "../../utils/units";

/** "Sat, 10 Oct" for a yyyy-mm-dd date. */
export const formatDay = (date?: string | null) =>
  date
    ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
    : "";

export const formatClock = (date: Date | string) =>
  new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const greeting = (now = new Date()) => {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

