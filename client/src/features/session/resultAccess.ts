import { RECORD_WINDOW_MS } from './resultTypes';
import type { Session } from './types';

/** What the Result section shows for one session and caller. */
export type ResultAccess =
  | { visible: false }
  | {
      visible: true;
      /** A JOINED participant inside the window: the Update button is available. */
      canEdit: boolean;
      /** `scheduledEndAt + 24h` has passed (the server refuses changes too: `SESSION_RECORD_WINDOW_CLOSED`). */
      windowClosed: boolean;
    };

/** When the 24-hour window for changing a session's results closes; null while the session has no end time. */
export function recordWindowEnd(session: Pick<Session, 'scheduledEndAt'>): Date | null {
  if (session.scheduledEndAt === null) return null;
  const end = new Date(session.scheduledEndAt);
  return Number.isNaN(end.getTime()) ? null : new Date(end.getTime() + RECORD_WINDOW_MS);
}

/**
 * CLIENT-GL-38: who sees the Result section and who may edit it.
 *
 * - Shown only for an ONGOING or COMPLETED session whose sport has a result schema (`hasSchema`).
 * - Editable only by a `JOINED` participant (a group member who has not joined sees it read-only) and only
 *   until `scheduledEndAt + 24h` on the client's own clock; the server stays the source of truth and the
 *   dialog still shows its `SESSION_RECORD_WINDOW_CLOSED` if it disagrees.
 */
export function getResultAccess(
  session: Pick<Session, 'status' | 'scheduledEndAt' | 'callerParticipation'>,
  hasSchema: boolean,
  now: Date,
): ResultAccess {
  if (!hasSchema || (session.status !== 'ONGOING' && session.status !== 'COMPLETED')) return { visible: false };
  const end = recordWindowEnd(session);
  const windowClosed = end !== null && now.getTime() > end.getTime();
  const isJoined = session.callerParticipation?.status === 'JOINED';
  return { visible: true, canEdit: isJoined && !windowClosed, windowClosed };
}
