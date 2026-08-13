import { useJoinSession } from './useJoinSession';
import { useLeaveSession } from './useLeaveSession';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';

/**
 * Wraps `useJoinSession`/`useLeaveSession` for the session card's single participation button
 * (CLIENT-SESSION-9) — Join/Accept both resolve to `POST .../join`, Cancel/Decline/Leave all
 * resolve to `DELETE .../leave` (see SESSION-9's backend writeup: the same endpoint now accepts
 * INVITED/REQUESTED rows too). `isParticipationActionPending` is keyed off each mutation's own
 * `variables` so a shared instance across a list of cards only shows the pending state on the
 * one card actually in flight.
 */
export function useSessionParticipationAction() {
  const joinMutation = useJoinSession();
  const leaveMutation = useLeaveSession();

  const onParticipationAction = (sessionId: number, kind: ParticipationActionKind) => {
    if (kind === 'JOIN' || kind === 'ACCEPT') {
      joinMutation.mutate(sessionId);
    } else {
      leaveMutation.mutate(sessionId); // CANCEL or LEAVE
    }
  };

  const isParticipationActionPending = (sessionId: number) =>
    (joinMutation.isPending && joinMutation.variables === sessionId) ||
    (leaveMutation.isPending && leaveMutation.variables === sessionId);

  return { joinMutation, leaveMutation, onParticipationAction, isParticipationActionPending };
}
