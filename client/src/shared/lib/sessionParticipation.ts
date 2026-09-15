import type { Session } from '@/shared/types/session';

export type ParticipationActionKind = 'JOIN' | 'ACCEPT' | 'CANCEL' | 'LEAVE';

export interface ParticipationAction {
  kind: ParticipationActionKind;
  label: string;
}

/**
 * Derives the caller's primary participation action from `session.callerParticipation` +
 * `session.status` (SESSION-9/CLIENT-SESSION-9). Shared by the session card (single action
 * button) and `SessionDetailModal` (same primary action, plus a Decline button of its own for
 * INVITED — not represented here). Returns null when the session's status doesn't allow
 * joining/leaving (COMPLETED/CANCELLED).
 *
 * CLIENT-SESSION-21: PREPARING is fully joinable, same as SCHEDULED/ONGOING (SESSION-24) — this
 * is the actual button-visibility gate a PREPARING session must clear, not `SessionDetailModal`'s
 * `canJoinOrLeave` (which only gates the approval-queue section).
 */
export function getParticipationAction(
  session: Pick<Session, 'status' | 'callerParticipation'>,
): ParticipationAction | null {
  if (session.status !== 'SCHEDULED' && session.status !== 'ONGOING' && session.status !== 'PREPARING') {
    return null;
  }

  const status = session.callerParticipation?.status;
  if (status === undefined || status === 'LEFT') return { kind: 'JOIN', label: 'Join' };
  if (status === 'INVITED') return { kind: 'ACCEPT', label: 'Accept' };
  if (status === 'REQUESTED') return { kind: 'CANCEL', label: 'Cancel' };
  return { kind: 'LEAVE', label: 'Leave' }; // JOINED
}
