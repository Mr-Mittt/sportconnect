// Single source of truth for this feature's TanStack Query keys — same shape as feedKeys/friendKeys.
export const locationKeys = {
  all: ['location'] as const,
  search: (sportId: number, q: string) => [...locationKeys.all, 'search', sportId, q] as const,
};
