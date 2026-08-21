// Single source of truth for the admin feature's TanStack Query keys — same shape as
// sessionKeys/feedKeys/locationKeys.
export const adminKeys = {
  all: ['admin'] as const,
  /** The admin-only full sport catalogue (`GET /api/sports/all`), inactive sports included.
   * Deliberately a different key from `sportCatalogQueryKey` — that one caches the public,
   * active-only `GET /api/sports` that the member-facing chrome reads, and the two return
   * different row sets for the same user. */
  sportsAll: () => [...adminKeys.all, 'sportsAll'] as const,
  attributeSchema: (sportId: number) => [...adminKeys.all, 'attributeSchema', sportId] as const,
};
