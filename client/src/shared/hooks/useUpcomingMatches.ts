import { useMemo } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useUpcomingSessions } from '@/features/session/hooks/useUpcomingSessions';
import type { Session } from '@/shared/types/session';

/**
 * The `UpcomingMatches` rail's data hook (Home Feed / Groups / Friends / Profile). Same
 * `{ data, isLoading, isError }` shape callers have always had (client/CLAUDE.md's data layer
 * convention) — `UpcomingMatches` itself and every host page are unchanged.
 *
 * CLIENT-SESSION-23: one `GET /sessions/upcoming` call (all sports — no `sportId`), replacing
 * CLIENT-SESSION-1's `useUserGroups` + per-group `GET /sessions/group/{id}` fan-out merged with
 * `GET /sessions/mine`. The endpoint already returns standalone and group-linked sessions in
 * one server-sorted (soonest-first) list, already status-filtered to `PREPARING`/`SCHEDULED`/
 * `ONGOING` — so the old client-side `SCHEDULED`/`ONGOING`-only filter (the bug that kept a
 * `PREPARING` session out of the rail) and the client-side sort are both gone rather than
 * re-implemented. Only the first page (20) is read: `UpcomingMatches` caps itself at
 * `maxVisible` on top of this, well inside one page, so the rail never needs "load more".
 *
 * Behavior change vs. the fan-out (user-accepted, CLIENT-SESSION-23): the endpoint is scoped by
 * the caller's own participant row (`JOINED`/`INVITED`), so a group session the caller hasn't
 * joined, and a standalone session they created and then left, no longer appear here.
 */
export function useUpcomingMatches(): {
  data: Session[];
  isLoading: boolean;
  isError: boolean;
} {
  const userId = useAuthStore((state) => state.user?.id);
  const query = useUpcomingSessions({ sportId: undefined, enabled: userId !== undefined });

  const data = useMemo<Session[]>(() => query.data?.pages[0]?.content ?? [], [query.data]);

  return { data, isLoading: query.isLoading, isError: query.isError };
}
