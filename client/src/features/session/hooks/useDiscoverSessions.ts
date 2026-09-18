import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/sessions/discover` — joinable SCHEDULED standalone sessions, gated
 * server-side to sports the caller holds an active profile for, excluding sessions the caller
 * created or currently has joined. `sportId` undefined asks for every active sport at once
 * (the backend's own default when the param is omitted); pass a specific id to narrow to one.
 *
 * SESSION-35 made the backend's `date` param required — this hook always sends the browser's
 * own today (`date-fns`' `format(new Date(), 'yyyy-MM-dd')`, same "local calendar day" pattern
 * `groupSessionsByDate` already uses), computed fresh on every call so a session mid-render
 * doesn't stick to a stale day. This narrows the Discover panel/modal to today's sessions only —
 * a real, accepted behavior change from browsing every upcoming day at once (no `viewerZoneId`
 * sent yet either, so the backend buckets that date in UTC, not the browser's zone, until
 * CLIENT-SESSION-24 wires up the real caller zone for this endpoint too). A follow-up ticket
 * (CLIENT-SESSION-27) tracks giving Discover a real date picker to browse beyond today again.
 */
export function useDiscoverSessions(sportId: number | undefined, enabled: boolean) {
  const date = format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: sessionKeys.discover(sportId, date),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/discover', {
        params: sportId !== undefined ? { sportId, date } : { date },
      });
      return response.data.data;
    },
    enabled,
  });
}
