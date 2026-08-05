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
 */
export function useDiscoverSessions(sportId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.discover(sportId),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/discover', {
        params: sportId !== undefined ? { sportId } : undefined,
      });
      return response.data.data;
    },
    enabled,
  });
}
