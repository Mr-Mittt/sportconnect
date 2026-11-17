/**
 * SESSION-65: a joined participant can leave only until this many minutes before the session starts.
 * Mirrors the server's constant; the server is the authority (a stale screen gets `SESSION_LEAVE_TOO_LATE`).
 */
export const LEAVE_CUTOFF_MINUTES = 15;

/** True while a joined participant may still leave: `now` is at or before start minus the cutoff. */
export function canLeaveBeforeStart(scheduledStartIso: string, now: Date): boolean {
  return now.getTime() <= new Date(scheduledStartIso).getTime() - LEAVE_CUTOFF_MINUTES * 60_000;
}
