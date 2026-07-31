import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/sessions/mine` — the caller's own **standalone** sessions only
 * (`SessionServiceImpl.getSessionsCreatedByUser`'s `findByCreatedByAndGroupIdIsNull`). A
 * group-linked session the caller created shows up via `useGroupSessions` instead, not here.
 */
export function useMySessions(enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.mine(),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<Session>>('/sessions/mine');
      return response.data.data;
    },
    enabled,
  });
}
