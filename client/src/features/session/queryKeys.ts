import { serializeDiscoverFilters, type DiscoverFilters } from './discoverParams';

// Single source of truth for this feature's TanStack Query keys — same shape as feedKeys/locationKeys.
export const sessionKeys = {
  all: ['session'] as const,
  group: (groupId: number) => [...sessionKeys.all, 'group', groupId] as const,
  mine: () => [...sessionKeys.all, 'mine'] as const,
  /** CLIENT-SESSION-22 — both discover-family keys nest under `[...all, 'discover']` (kept from
   * the pre-22 shape) so `useAddSportProfile`'s existing broad `invalidateQueries({queryKey:
   * [...sessionKeys.all, 'discover']})` (GET /sessions/discover is gated to the caller's active
   * sport profiles, so adding one must invalidate every cached discover query) keeps matching both
   * without that hook needing to know either builder's exact shape. */
  discoverCounts: (filters: DiscoverFilters, dates: string[] | undefined) =>
    [
      ...sessionKeys.all,
      'discover',
      'counts',
      serializeDiscoverFilters(filters),
      dates !== undefined ? [...dates].sort() : 'default-window',
    ] as const,
  /** `date` (yyyy-MM-dd) is part of the key so the day rolling over invalidates the cached page
   * instead of serving yesterday's results — same reasoning the pre-22 single-date key had. */
  discoverDate: (date: string, filters: DiscoverFilters) =>
    [...sessionKeys.all, 'discover', 'date', date, serializeDiscoverFilters(filters)] as const,
  /** CLIENT-SESSION-6: one cache entry for every status now that GET /sessions/joined's
   * `status` param is optional (SESSION-4 delta, 2026-08-05) — the "My sessions" panel needs
   * the caller's whole joined history/upcoming at once, not one query per SessionStatus. */
  joined: () => [...sessionKeys.all, 'joined'] as const,
  detail: (sessionId: number) => [...sessionKeys.all, 'detail', sessionId] as const,
  participants: (sessionId: number) => [...sessionKeys.all, 'participants', sessionId] as const,
  /** Separate cache entry from `participants` above — that one is always JOINED-only (the public
   * default), this is the REQUESTED-only approval queue (canManage-gated backend-side). */
  requestedParticipants: (sessionId: number) =>
    [...sessionKeys.all, 'requestedParticipants', sessionId] as const,
  /** CLIENT-SESSION-8: the session's comment thread (SESSION-10's SESSION_POST-anchored
   * comments, reached only through the session-scoped /sessions/{id}/comments endpoints). */
  comments: (sessionId: number) => [...sessionKeys.all, 'comments', sessionId] as const,
};
