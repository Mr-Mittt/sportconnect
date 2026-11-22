import { format, subDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useGroupSessionsTabStore } from '@/app/groupSessionsTabStore';
import type { Session, SessionStatus } from '@/shared/types/session';
import { defaultHistoryMonth, earliestHistoryMonth, historyMonthWindow, shiftMonth } from './groupHistoryMonth';
import { useGroupHistoryDates } from './hooks/useGroupHistoryDates';
import { useGroupSessionsLater } from './hooks/useGroupSessionsLater';
import { useGroupSessionsToday } from './hooks/useGroupSessionsToday';
import type { GroupSessionSection } from './groupSessionStatuses';
import type { SessionHistoryDate } from './types';

const DAY = 'yyyy-MM-dd';

/**
 * CLIENT-GROUP-SESSION-2: everything the group Sessions tab shows, for one group. Today's, Others and the History dates, each
 * with the status filter the viewer chose (`useGroupSessionsTabStore`, kept for the browser session), plus which history dates
 * are expanded: **yesterday starts expanded**, every other date collapsed (owner, 2026-11-20); a date the viewer toggled stays as
 * they left it. The tab is mounted per group (`key`), so this state starts fresh for every group.
 *
 * **History shows one month at a time and lists every day of it, whether or not it has a finished session** (owner, 2026-11-20 for
 * the days; CLIENT-GROUP-UI-1, 2026-11-22 for the month): the month filter starts on the month of yesterday (the previous month on
 * the 1st) and is not remembered (this state starts fresh every time the tab is opened), its arrows go back to the month the group
 * was created in (`groupCreatedAt`) and forward to yesterday's month. The server's `/history/dates` only returns the days that
 * have sessions, so the day rows are built here from the month's window (`historyMonthWindow`, newest first) and the counts are
 * read from the answer, 0 for the rest. Nothing is requested for a section whose filter is empty.
 */
export function useGroupSessionsTabData(groupId: number, enabled: boolean, groupCreatedAt?: string) {
  const statuses = useGroupSessionsTabStore((state) => state.statuses);
  const setStatuses = useGroupSessionsTabStore((state) => state.setStatuses);

  const todayQuery = useGroupSessionsToday(groupId, statuses.today, enabled);
  const laterQuery = useGroupSessionsLater(groupId, statuses.others, enabled);
  const todayKey = format(new Date(), DAY);
  const latestMonth = defaultHistoryMonth(new Date());
  const earliestMonth = earliestHistoryMonth(groupCreatedAt);
  const [historyMonth, setHistoryMonth] = useState(latestMonth);
  const historyWindow = useMemo(() => historyMonthWindow(historyMonth, todayKey), [historyMonth, todayKey]);
  const historyQuery = useGroupHistoryDates(groupId, statuses.history, historyMonth, historyWindow, enabled);

  const laterSessions = useMemo<Session[]>(() => (laterQuery.data?.pages ?? []).flatMap((page) => page.content), [laterQuery.data]);

  const historyData = historyQuery.data;
  const historyDays = useMemo<SessionHistoryDate[]>(() => {
    if (historyWindow === null) return [];
    const counts = new Map((historyData?.dates ?? []).map(({ date, count }) => [date, count]));
    return historyWindow.daysNewestFirst.map((date) => ({ date, count: counts.get(date) ?? 0 }));
  }, [historyWindow, historyData]);

  // Yesterday (the viewer's local day, the zone every call sends) is open unless toggled; others closed unless toggled.
  const yesterday = format(subDays(new Date(), 1), DAY);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const expandedDates = useMemo(() => {
    const expanded = new Set<string>();
    for (const { date } of historyDays) {
      if ((date === yesterday) !== toggled.has(date)) expanded.add(date);
    }
    return expanded;
  }, [historyDays, toggled, yesterday]);
  const toggleDate = (date: string) =>
    setToggled((previous) => {
      const next = new Set(previous);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return {
    statuses,
    setSectionStatuses: (section: GroupSessionSection, selected: readonly SessionStatus[]) => setStatuses(section, selected),
    today: {
      sessions: todayQuery.data ?? [],
      isLoading: todayQuery.isLoading,
      isError: todayQuery.isError,
      onRetry: () => void todayQuery.refetch(),
    },
    others: {
      sessions: laterSessions,
      isLoading: laterQuery.isLoading,
      isError: laterQuery.isError,
      onRetry: () => void laterQuery.refetch(),
      hasMore: laterQuery.hasNextPage,
      isFetchingMore: laterQuery.isFetchingNextPage,
      onLoadMore: () => void laterQuery.fetchNextPage(),
    },
    history: {
      /** Every day of every loaded window, newest first, each with its count (0 for a day with no finished session). */
      dates: historyDays,
      isLoading: historyQuery.isLoading,
      isError: historyQuery.isError,
      onRetry: () => void historyQuery.refetch(),
      /** The month shown (`yyyy-MM`) and its arrows: back stops at the group's first month, forward at yesterday's month. */
      month: historyMonth,
      canGoPrevious: earliestMonth === null || historyMonth > earliestMonth,
      canGoNext: historyMonth < latestMonth,
      onPreviousMonth: () => setHistoryMonth((month) => shiftMonth(month, -1)),
      onNextMonth: () => setHistoryMonth((month) => shiftMonth(month, 1)),
      expandedDates,
      onToggleDate: toggleDate,
    },
    /** `yyyy-MM-dd` of the viewer's today, for the "Today" label of a date row. */
    todayKey,
  };
}
