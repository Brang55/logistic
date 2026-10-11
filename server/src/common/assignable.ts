// Shared status values for trucks, trailers and drivers.
export const AVAILABLE = "available";
export const TAKEN = "taken";
export const RESOURCE_STATUSES = [AVAILABLE, TAKEN] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

// Forms send "" for unselected relations; store those as NULL.
export const nullIfEmpty = (value?: string | null) => (value ? value : null);
