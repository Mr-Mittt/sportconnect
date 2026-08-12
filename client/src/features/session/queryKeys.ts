// Single source of truth for this feature's TanStack Query keys — same shape as feedKeys/locationKeys.
export const sessionKeys = {
  all: ['session'] as const,
  group: (groupId: number) => [...sessionKeys.all, 'group', groupId] as const,
  mine: () => [...sessionKeys.all, 'mine'] as const,
  /** sportId undefined = every sport the caller holds an active profile for (backend default). */
  discover: (sportId: number | undefined) => [...sessionKeys.all, 'discover', sportId ?? 'all'] as const,
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
