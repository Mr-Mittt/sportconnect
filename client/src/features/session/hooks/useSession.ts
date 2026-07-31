import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session } from '@/shared/types/session';
import type { ApiResponse } from '@/shared/types/api';

/** Wraps `GET /api/sessions/{sessionId}`. */
export function useSession(sessionId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Session>>(`/sessions/${sessionId}`);
      return response.data.data;
    },
    enabled: enabled && sessionId !== undefined,
  });
}
