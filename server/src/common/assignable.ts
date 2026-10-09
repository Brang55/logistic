// Shared status values for trucks, trailers and drivers.
export const AVAILABLE = "available";
export const TAKEN = "taken";

// Forms send "" for unselected relations; store those as NULL.
export const nullIfEmpty = (value?: string | null) => (value ? value : null);
