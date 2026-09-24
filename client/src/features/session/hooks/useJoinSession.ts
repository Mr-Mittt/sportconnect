import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useJoinFeedbackStore, type JoinFeedbackKind } from '@/app/joinFeedbackStore';
import type { ApiResponse } from '@/shared/types/api';
import type { Session } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';

/**
 * Wraps `POST /api/sessions/{sessionId}/join` — group-linked sessions require group
 * membership backend-side, standalone is open. Upserts (an existing `LEFT` row flips back to
 * `JOINED`), so this is safe to call even if the caller already left once.
 *
 * CLIENT-SESSION-30: `POST .../join` returns no body and the backend alone decides whether the
 * caller is now `JOINED` (auto-approve, or an accepted invitation) or `REQUESTED` (host approval
 * needed), so the mutation reads the session back (`GET /sessions/{id}`, also primed into the
 * detail cache) and opens the matching information pop-up via `joinFeedbackStore`. This is the
 * one hook every join goes through (cards on every page, the Discover modal, the detail modal),
 * which is why the pop-up is triggered here rather than in each host. The read-back is
 * best-effort: if it fails the join itself still succeeded, so no pop-up rather than an error.
 *
 * `offerOpenSession` (default false) is fixed per hook instance, not per call: a card-driven
 * instance passes true, so the pop-up also offers an "Open session" button (the detail isn't open
 * yet); `SessionDetailModal`'s own instance leaves it false (it already is the detail). It is a
 * hook option rather than a `mutate()` callback because the card that fired the join often unmounts
 * right away (a joined session leaves Discover) and mutate-level callbacks would then never run.
 */
export function useJoinSession({ offerOpenSession = false }: { offerOpenSession?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: number): Promise<JoinFeedbackKind | null> => {
      await apiClient.post(`/sessions/${sessionId}/join`);
      try {
        const response = await apiClient.get<ApiResponse<Session>>(`/sessions/${sessionId}`);
        queryClient.setQueryData(sessionKeys.detail(sessionId), response.data.data);
        const status = response.data.data.callerParticipation?.status;
        return status === 'JOINED' || status === 'REQUESTED' ? status : null;
      } catch {
        return null;
      }
    },
    onSuccess: (outcome, sessionId) => {
      if (outcome !== null) {
        useJoinFeedbackStore.getState().show(outcome, offerOpenSession ? sessionId : null);
      }
      return queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}
