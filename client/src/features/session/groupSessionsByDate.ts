import { format } from 'date-fns';
import type { SessionListItem } from './types';

/**
 * Keeps the first occurrence of each session id. The "My sessions" panel merges several
 * sources that legitimately overlap (e.g. a standalone session I created is both in `mine` and
 * in `joined`, since `createSession` auto-JOINs the creator) — this collapses them back to one
 * card per session before grouping/rendering.
 */
export function dedupeSessionsById(sessions: SessionListItem[]): SessionListItem[] {
  const seen = new Map<number, SessionListItem>();
  for (const session of sessions) {
    if (!seen.has(session.id)) {
      seen.set(session.id, session);
    }
  }
  return [...seen.values()];
}

export interface SessionDateGroup {
  /** yyyy-MM-dd, local calendar day of `scheduledStart` — stable sort/toggle key. */
  dateKey: string;
  /** "Today" for the current calendar day, else "MMM d, yyyy". */
  dateLabel: string;
  sessions: SessionListItem[];
}

/**
 * Groups sessions by the local calendar day of `scheduledStart`, in two zones (folding
 * Scheduled/Ongoing in alongside Completed/Cancelled into one date-grouped list rather than a
 * separate upcoming/history split — matches the redesigned Matches page's "My sessions" panel):
 * - Today and every future day sort ascending, soonest first, at the top (Today, Tomorrow, ...).
 * - Every day before today sorts descending, most-recent first, below the upcoming zone
 *   (Yesterday, 2 days ago, ...).
 * Each group's own sessions are sorted ascending (soonest-in-that-day first) regardless of zone.
 */
function compareDateKeys(a: string, b: string, todayKey: string): number {
  const aIsUpcoming = a >= todayKey;
  const bIsUpcoming = b >= todayKey;
  if (aIsUpcoming !== bIsUpcoming) {
    return aIsUpcoming ? -1 : 1;
  }
  return aIsUpcoming ? a.localeCompare(b) : b.localeCompare(a);
}

export function groupSessionsByDate(
  sessions: SessionListItem[],
  now: Date = new Date(),
): SessionDateGroup[] {
  const todayKey = format(now, 'yyyy-MM-dd');
  const byDate = new Map<string, SessionListItem[]>();

  for (const session of sessions) {
    const dateKey = format(new Date(session.scheduledStart), 'yyyy-MM-dd');
    const group = byDate.get(dateKey);
    if (group) {
      group.push(session);
    } else {
      byDate.set(dateKey, [session]);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => compareDateKeys(a, b, todayKey))
    .map(([dateKey, groupSessions]) => ({
      dateKey,
      dateLabel: dateKey === todayKey ? 'Today' : format(new Date(dateKey), 'MMM d, yyyy'),
      sessions: [...groupSessions].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    }));
}
