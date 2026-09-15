import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { Session, UpdateSessionPayload } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `PUT /api/sessions/{sessionId}` — partial update, only non-null fields are applied
 * backend-side. CLIENT-SESSION-21 is the first consumer: `SessionPreparingCompletion` (via
 * `useSessionDetailModalData`'s `onCompleteSession`) completes a `PREPARING` session's still-
 * missing `locationId`/`feeType` (SESSION-24). `updateSession` rejects touching either field at
 * all once the session is no longer `PREPARING` — this hook doesn't enforce that client-side, it
 * just surfaces the resulting 400 via `isError` on the mutation.
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
