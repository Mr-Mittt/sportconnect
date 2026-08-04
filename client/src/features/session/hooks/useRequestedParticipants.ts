import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { SessionParticipant } from '@/shared/types/session';
import type { PagedApiResponse } from '@/features/feed/types';

/**
 * Wraps `GET /api/sessions/{sessionId}/participants?status=REQUESTED` — the approval queue.
 * Backend-gated to canManage callers (creator/owner-admin); `enabled` should stay false for
 * anyone else so this never fires a request that would 400.
 */
export function useRequestedParticipants(sessionId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.requestedParticipants(sessionId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<PagedApiResponse<SessionParticipant>>(
        `/sessions/${sessionId}/participants`,
        { params: { status: 'REQUESTED' } },
      );
      return response.data.data;
    },
    enabled: enabled && sessionId !== undefined,
  });
}
