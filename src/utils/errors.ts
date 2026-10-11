/** The API's error message (Nest validation sends a list), or `fallback` when there is none. */
export const errorMessage = (error: unknown, fallback = "Something went wrong. Try again.") => {
  const message = (error as { data?: { message?: string | string[] } } | undefined)?.data?.message;
  return (Array.isArray(message) ? message.join(", ") : message) || fallback;
};
