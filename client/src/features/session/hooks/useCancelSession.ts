import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { CancelSessionPayload, Session } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `POST /api/sessions/{sessionId}/cancel` — always soft (sets `status=CANCELLED`, keeps
 * `cancelReason`/`cancelledBy`/`cancelledAt`); there is no delete endpoint
 * (`SessionServiceImpl` removed it entirely in the backend's SESSION-3).
 */
export function useCancelSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, payload }: { sessionId: number; payload: CancelSessionPayload }) => {
      const response = await apiClient.post<ApiResponse<Session>>(`/sessions/${sessionId}/cancel`, payload);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
