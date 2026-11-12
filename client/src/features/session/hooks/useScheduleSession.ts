import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportSessionDialogError } from '../sessionErrors';
import { sessionKeys } from '../queryKeys';
import type { Session } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/**
 * Wraps `POST /api/sessions/{sessionId}/schedule` (SESSION-46) — the one way a `PREPARING` session
 * becomes `SCHEDULED` (nothing flips it automatically any more). The server answers 409
 * `SESSION_NOT_PREPARING` (reported by the app-wide session error dialog) or 400 `SESSION_NOT_READY`
 * (its `errorParams.missing` lists what is still needed; shown inline in the confirmation popup).
 * Invalidates every session query, like the other session mutations.
 */
export function useScheduleSession() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    onError: reportSessionDialogError,
    mutationFn: async (sessionId: number) => {
      const response = await apiClient.post<ApiResponse<Session>>(`/sessions/${sessionId}/schedule`);
      return response.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
