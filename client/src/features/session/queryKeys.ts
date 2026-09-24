import { serializeDiscoverFilters, type DiscoverFilters } from './discoverParams';

// Single source of truth for this feature's TanStack Query keys — same shape as feedKeys/locationKeys.
export const sessionKeys = {
  all: ['session'] as const,
  /** CLIENT-SESSION-23 — `GET /sessions/upcoming` (backend SESSION-27/43), replacing the retired
   * `mine`/`joined`/per-group fan-out keys. `sportId: undefined` = all sports (the
   * `UpcomingMatches` rail); the Matches page always passes its active sport. No `viewerZoneId`
   * piece — the un-dated call never sends one (the backend 400s on it without `date`). */
  upcoming: (sportId: number | undefined) =>
    [...sessionKeys.all, 'upcoming', sportId ?? 'all'] as const,
  /** CLIENT-SESSION-23 — `GET /sessions/history?dateCount=`: the distinct history dates (+ counts)
   * for one sport, in the viewer's zone (`viewerZoneId` is part of the key because it changes
   * which calendar date a session lands on, exactly what the key must reflect). */
  historyDates: (sportId: number, viewerZoneId: string) =>
    [...sessionKeys.all, 'history', 'dates', sportId, viewerZoneId] as const,
  /** CLIENT-SESSION-23 — `GET /sessions/history?date=`: one date's own session list. */
  historyDate: (sportId: number, date: string, viewerZoneId: string) =>
    [...sessionKeys.all, 'history', 'date', sportId, date, viewerZoneId] as const,
  /** CLIENT-SESSION-29 — `GET /sessions/requested` (backend SESSION-42): the caller's own
   * pending join requests, standalone or group-linked. Its own top-level key, not nested under
   * `'discover'` — unlike the two builders below, this endpoint takes no filters at all, so it
   * needs no `serializeDiscoverFilters` key piece. */
  requested: () => [...sessionKeys.all, 'requested'] as const,
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
