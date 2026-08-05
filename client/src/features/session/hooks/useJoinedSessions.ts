import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/sessions/joined` — every session (standalone or group-linked) the caller
 * currently has a JOINED participant row for, across every status in one page (SESSION-4's
 * `status` param became optional 2026-08-05 specifically for this: the "My sessions" panel
 * needs the caller's whole joined history/upcoming at once, not a 4-call fan-out per
 * SessionStatus). Doesn't cover a session the caller only *manages* via a group role without
 * having personally joined it — that's `useGroupSessionsForGroups`' job, merged in the page hook.
 */
export function useJoinedSessions(enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.joined(),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/joined');
      return response.data.data;
    },
    enabled,
  });
}
