import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { reportSessionDialogError } from '../sessionErrors';
import type { ShareSessionResponse } from '../types';
import type { ApiResponse } from '@/shared/types/api';

/** The most friends one share can reach: the server takes 1 to 50 per call (`ShareSessionRequest.MAX_RECIPIENTS`). */
export const SHARE_LIMIT = 50;

/**
 * Wraps `POST /api/sessions/{sessionId}/shares` (SESSION-66, CLIENT-SESSION-49): sends a standalone session to the chosen friends
 * as a notification. Nothing in the session changes (no participant row, no comment), so no query is invalidated.
 *
 * The answer is `{ sent, skipped }`; `sent` can be lower than the number chosen (a friend who joined meanwhile, was deactivated
 * or is no longer a friend is skipped without an error), which is why the dialog's confirmation does not repeat a count.
 * A 404 `SESSION_NOT_FOUND` or a 403 `SESSION_SHARE_NOT_ALLOWED` is reported by the app-wide session error dialog (the share
 * dialog closes when that dialog is dismissed); any other failure stays on the mutation for the dialog's own inline line.
 */
export function useShareSession() {
  return useMutation({
    meta: { errorDisplay: 'inline' },
    onError: reportSessionDialogError,
    mutationFn: async ({ sessionId, userIds }: { sessionId: number; userIds: string[] }) => {
      const response = await apiClient.post<ApiResponse<ShareSessionResponse>>(`/sessions/${sessionId}/shares`, { userIds });
      return response.data.data;
    },
  });
}
