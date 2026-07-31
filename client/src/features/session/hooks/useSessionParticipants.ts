import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { SessionParticipant } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

/** Wraps `GET /api/sessions/{sessionId}/participants` — JOINED-only, backend-filtered. */
export function useSessionParticipants(sessionId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.participants(sessionId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<SessionParticipant>>(
        `/sessions/${sessionId}/participants`,
      );
      return response.data.data;
    },
    enabled: enabled && sessionId !== undefined,
  });
}
