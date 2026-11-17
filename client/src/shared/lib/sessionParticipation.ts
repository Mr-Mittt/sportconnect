import i18next from 'i18next';
import { canLeaveBeforeStart } from '@/shared/lib/leaveCutoff';
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
 *
 * CLIENT-GL-51 / SESSION-65: a JOINED participant gets no Leave action once `now` is within
 * `LEAVE_CUTOFF_MINUTES` of the start (or past it); cancelling a request and declining an invitation stay.
 * Without a `scheduledStart` there is no cutoff. `now` is a parameter so a ticking caller can re-evaluate.
 */
export function getParticipationAction(
  session: Pick<Session, 'status' | 'callerParticipation'> & { scheduledStart?: string },
  now: Date = new Date(),
): ParticipationAction | null {
  if (session.status !== 'SCHEDULED' && session.status !== 'ONGOING' && session.status !== 'PREPARING') {
    return null;
  }

  const status = session.callerParticipation?.status;
  if (status === undefined || status === 'LEFT') return { kind: 'JOIN', label: i18next.t('session:participation.join') };
  if (status === 'INVITED') return { kind: 'ACCEPT', label: i18next.t('session:participation.accept') };
  if (status === 'REQUESTED') return { kind: 'CANCEL', label: i18next.t('session:participation.cancel') };
  // JOINED
  if (session.scheduledStart !== undefined && !canLeaveBeforeStart(session.scheduledStart, now)) return null;
  return { kind: 'LEAVE', label: i18next.t('session:participation.leave') };
}
