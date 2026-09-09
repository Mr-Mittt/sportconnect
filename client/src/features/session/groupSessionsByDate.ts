import { format } from 'date-fns';
import type { SessionStatus } from '@/shared/types/session';
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

/** `SCHEDULED`/`ONGOING` — a session that hasn't reached a terminal state. Everything else
 * (`COMPLETED`, `CANCELLED`) is "history". */
const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>(['SCHEDULED', 'ONGOING']);

export type SessionZone = 'active' | 'history';

export interface SessionDateGroup {
  /**
   * Composite `${zone}:${yyyy-MM-dd}` — the collapse-state identity (consumed opaquely by
   * `MatchesPage`/`SessionDateGroup`). It has to be zone-qualified because the same calendar day
   * can appear in both zones (its active sessions up top, its completed ones down in history).
   */
  dateKey: string;
  zone: SessionZone;
  /** "Today" for the current calendar day, else "MMM d, yyyy" — legitimately repeats now. */
  dateLabel: string;
  sessions: SessionListItem[];
}

/**
 * Groups the "My sessions" panel into two **status** zones (CLIENT-SESSION-20 — was two *date*
 * zones), each grouped by the local calendar day of `scheduledStart`:
 *
 * - **Active** (`SCHEDULED` + `ONGOING`): date groups ascending (soonest day first), each day's
 *   sessions ascending by start time. Renders first.
 * - **History** (`COMPLETED` + `CANCELLED`): date groups descending (most-recent day first), each
 *   day's sessions descending by start time — the whole zone reads newest → oldest. Renders after
 *   the active zone.
 *
 * A day with both active and terminal sessions therefore appears in both zones (e.g. a "Today"
 * group on top, another "Today" group further down). No zone divider — the per-day headers carry
 * it.
 */
export function groupSessionsByDate(
  sessions: SessionListItem[],
  now: Date = new Date(),
): SessionDateGroup[] {
  const todayKey = format(now, 'yyyy-MM-dd');

  const activeByDate = new Map<string, SessionListItem[]>();
  const historyByDate = new Map<string, SessionListItem[]>();

  for (const session of sessions) {
    const dateKey = format(new Date(session.scheduledStart), 'yyyy-MM-dd');
    const byDate = ACTIVE_STATUSES.has(session.status) ? activeByDate : historyByDate;
    const group = byDate.get(dateKey);
    if (group) {
      group.push(session);
    } else {
      byDate.set(dateKey, [session]);
    }
  }

  const toGroups = (byDate: Map<string, SessionListItem[]>, zone: SessionZone): SessionDateGroup[] => {
    const dateAsc = zone === 'active';
    return [...byDate.entries()]
      .sort(([a], [b]) => (dateAsc ? a.localeCompare(b) : b.localeCompare(a)))
      .map(([dateKey, groupSessions]) => ({
        dateKey: `${zone}:${dateKey}`,
        zone,
        dateLabel: dateKey === todayKey ? 'Today' : format(new Date(dateKey), 'MMM d, yyyy'),
        sessions: [...groupSessions].sort((a, b) =>
          dateAsc
            ? a.scheduledStart.localeCompare(b.scheduledStart)
            : b.scheduledStart.localeCompare(a.scheduledStart),
        ),
      }));
  };

  return [...toGroups(activeByDate, 'active'), ...toGroups(historyByDate, 'history')];
}
