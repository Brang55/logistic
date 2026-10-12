/** Collapses repeated messages (the routing engine reports each restricted road section separately). */
export const groupMessages = (messages: string[]) => {
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message, (counts.get(message) ?? 0) + 1);
  return [...counts].map(([message, count]) => ({ message, count }));
};
