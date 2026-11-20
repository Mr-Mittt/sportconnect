import { SHORTCUT_STATUSES } from './groupSessionStatuses';
import { useGroupSessionsToday } from './hooks/useGroupSessionsToday';

/**
 * CLIENT-GROUP-SESSION-1, moved to one call by CLIENT-GROUP-SESSION-2: the data of the group Posts tab's "Today's session"
 * shortcut. The sessions of `GET /sessions/group/{groupId}/today` (SESSION-GROUP-12) that are `ONGOING`, `SCHEDULED` or
 * `PREPARING`, in the server's order (ONGOING, SCHEDULED, PREPARING, then start). The server decides what "today" is, in the
 * viewer's zone, and a session that started yesterday and ends today or tomorrow counts; `COMPLETED` and `CANCELLED` sessions are
 * never listed (the session writes invalidate the query, so a session leaves the list when it ends or is cancelled). One page
 * (the server's 50): a group has a handful of sessions a day.
 *
 * `isError` is true when the call failed; the shortcut then shows its retry line and keeps its "+" usable.
 */
export function useGroupSessionShortcutData(groupId: number | undefined, enabled: boolean) {
  const query = useGroupSessionsToday(groupId, SHORTCUT_STATUSES, enabled);
  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}
