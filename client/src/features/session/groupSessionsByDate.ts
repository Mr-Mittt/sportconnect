import { format } from 'date-fns';
import type { Session } from '@/shared/types/session';

/**
 * "Today" for the given calendar day, else `MMM d, yyyy` (e.g. "Sep 20, 2026") — the one label
 * format shared by the Upcoming section's day headers and the History section's date rows, so
 * both read alike. `dateKey`/`today` are `yyyy-MM-dd`; parsed as local midnight (`T00:00:00`),
 * never bare `new Date('yyyy-MM-dd')`, which is UTC midnight and shows the previous day in any
 * zone west of UTC.
 */
export function formatSessionDayLabel(dateKey: string, today: string): string {
  return dateKey === today ? 'Today' : format(new Date(`${dateKey}T00:00:00`), 'MMM d, yyyy');
}

export interface SessionDateGroup {
  /** `yyyy-MM-dd` (local calendar day of `scheduledStart`) — the collapse-state identity. */
  dateKey: string;
  /** "Today" or "MMM d, yyyy". */
  dateLabel: string;
  sessions: Session[];
}

/**
 * Groups the Upcoming section's sessions into one collapsible block per local calendar day of
 * `scheduledStart`. CLIENT-SESSION-23: `GET /sessions/upcoming` is already server-sorted
 * soonest-first (backend SESSION-27's non-overridable `ORDER BY`), so this **preserves input
 * order** — days come out ascending and each day's sessions stay in start order without a
 * client-side re-sort that could disagree with the server's `PREPARING`→`SCHEDULED`→`ONGOING`
 * tiebreak. It replaces CLIENT-SESSION-20's dual active/history zone split: history is now its
 * own endpoint (`GET /sessions/history`) and its own section, never date-grouped client-side.
 *
 * Grouping runs over the flattened pages loaded so far, so a day that straddles a page boundary
 * still comes out as one group once its next page loads.
 */
export function groupSessionsByDate(sessions: Session[], now: Date = new Date()): SessionDateGroup[] {
  const today = format(now, 'yyyy-MM-dd');
  const groups = new Map<string, SessionDateGroup>();
  for (const session of sessions) {
    const dateKey = format(new Date(session.scheduledStart), 'yyyy-MM-dd');
    const group = groups.get(dateKey);
    if (group) {
      group.sessions.push(session);
    } else {
      groups.set(dateKey, { dateKey, dateLabel: formatSessionDayLabel(dateKey, today), sessions: [session] });
    }
  }
  return [...groups.values()];
}
