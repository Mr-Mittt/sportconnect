import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { CreateCommentPayload } from '@/features/feed/types';
import { sessionKeys } from '../queryKeys';

interface CreateSessionCommentVariables {
  sessionId: number;
  payload: CreateCommentPayload;
}

/**
 * Wraps `POST /api/sessions/{sessionId}/comments`. No optimistic insert (same reasoning as
 * `useCreateComment`) — the new comment/reply is picked up by invalidating the thread on
 * success rather than hand-constructing it client-side. Unlike `useCreateComment`, there's no
 * parent-post `commentCount` to bump optimistically — `Session` has no comment-count field
 * rendered anywhere in the UI.
 */
export function useCreateSessionComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, payload }: CreateSessionCommentVariables) =>
      apiClient.post(`/sessions/${sessionId}/comments`, payload),
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.comments(sessionId) });
    },
  });
}
