import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session, UpdateSessionPayload } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `PUT /api/sessions/{sessionId}` — partial update, only non-null fields are applied
 * backend-side. No edit UI consumes this yet (CLIENT-SESSION-1's scope is create/list/join/
 * leave/cancel); provided for a follow-up edit-UI ticket to build against.
 */
export function useUpdateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, payload }: { sessionId: number; payload: UpdateSessionPayload }) => {
      const response = await apiClient.put<ApiResponse<Session>>(`/sessions/${sessionId}`, payload);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
