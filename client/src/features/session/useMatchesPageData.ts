import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useHistoryDates } from './hooks/useHistoryDates';
import { useRequestedSessions } from './hooks/useRequestedSessions';
import { useSessionParticipationAction } from './hooks/useSessionParticipationAction';
import { useUpcomingSessions } from './hooks/useUpcomingSessions';
import { groupSessionsByDate } from './groupSessionsByDate';
import { useDiscoverFilters } from './useDiscoverFilters';
import { useCreateSessionModalData } from './useCreateSessionModalData';
import { useMatchesActiveSport } from './useMatchesActiveSport';
import { useSessionDetailModalData } from './useSessionDetailModalData';

/**
 * The Matches page's data boundary — composes every session query/mutation this ticket needs
 * (discover + the Upcoming/History sections, create, detail, join/leave/cancel) plus
 * `LocationPicker`'s data hook for the create form's required location field, so
 * `MatchesPage`/`SessionCard`/`CreateSessionModal`/`SessionDetailModal` all stay
 * presentational and controlled per `client/CLAUDE.md` — same "mega page-data hook" shape as
 * `useGroupsPageData`/`useHomeFeedData`.
 *
 * `initialSessionId` seeds the detail dialog open on mount for the rail card's
 * `?session={id}` deep link (same `useParams`-seeds-page-state precedent FEED-12 established
 * for `/posts/:postId`, via a query param instead of a path segment since the primary
 * interaction shape here is a dialog, not a route — see CLIENT-SESSION-1's design decision).
 *
 * CLIENT-SESSION-6 split the old single merged list into two panels, and CLIENT-SESSION-23 then
 * split the second one again:
 *  - **Discover** (`useDiscoverFilters`, CLIENT-SESSION-22) — joinable sessions from other users,
 *    scoped by the active sport switcher pill, with real Date/Location/Time filters.
 *  - **Upcoming sessions** (`GET /sessions/upcoming`, backend SESSION-27/43) — the caller's
 *    `JOINED`/`INVITED` `PREPARING`/`SCHEDULED`/`ONGOING` sessions in the active sport, one
 *    server-sorted infinite list, day-grouped client-side.
 *  - **History** (`GET /sessions/history`) — one collapsed row per distinct history date
 *    (`dateCount` pages, `before` cursor) for the active sport; a date's own sessions are fetched
 *    lazily by `HistoryDateSessions` once expanded (see its doc comment for why that one fetch
 *    lives in a component rather than here).
 *  The old `mine` + `joined` + per-group `useQueries` fan-out, its `dedupeSessionsById` merge
 *  and the client-side sport filter are all gone: the endpoints are participant-scoped (so a
 *  group session the caller hasn't joined, or a standalone one they created then left, no longer
 *  appears — user-accepted) and take `sportId` server-side, which is what keeps pagination and the
 *  per-date history counts honest (a client-side filter over server-paged data returns short pages
 *  and counts other sports' sessions).
 */
export function useMatchesPageData(initialSessionId: number | null) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  // CLIENT-SESSION-29 (2026-09-23) — /matches no longer offers an "All sports" pill (user
  // decision); `useMatchesActiveSport` defaults to the caller's first sport profile instead of a
  // `'all'` state (same shape as /profile's own PROFILE-4 delta).
  const { activeSport } = useMatchesActiveSport();
  const setActiveSport = useMatchesPageStore((state) => state.setActiveSport);

  const sportProfilesQuery = useSportProfiles();
  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
  );

  const activeSportId = activeSport !== undefined ? sportIdForKey(activeSport) : undefined;

  // --- Discover panel ---
  // CLIENT-SESSION-22: owns the Date/Location/Time filter pills + per-date sections, shared with
  // useDiscoverModalData so the inline panel and the rail modal never drift.
  const discoverFilters = useDiscoverFilters(activeSportId, currentUserId !== undefined);

  // --- Upcoming sessions + History (CLIENT-SESSION-23) ---
  // Both need a resolved active sport (`sportId` is required by /history and is what scopes
  // /upcoming here), so they stay disabled until the caller's sport profiles have loaded — a
  // zero-profile caller never fires them (MatchesPage's own no-sports gate handles that page).
  const isSignedIn = currentUserId !== undefined;
  const upcomingQuery = useUpcomingSessions({
    sportId: activeSportId,
    enabled: isSignedIn && activeSportId !== undefined,
  });
  const historyDatesQuery = useHistoryDates(isSignedIn ? activeSportId : undefined);

  // Groups are only still needed to resolve a Requested session's `groupName` — the Upcoming
  // cards never read it, so the old per-group session fan-out is gone.
  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => groupsQuery.data?.content ?? [], [groupsQuery.data]);

  // --- Requested sessions (CLIENT-SESSION-29) — the Discover panel's own section, not "My
  // sessions"; reuses this hook's already-fetched `groups` list for groupName resolution rather
  // than fetching it a second time (the Upcoming section no longer resolves group names at all).
  const requestedSessionsQuery = useRequestedSessions(currentUserId !== undefined);
  const requestedSessions = useMemo(
    () =>
      (requestedSessionsQuery.data?.pages ?? []).flatMap((page) =>
        page.content.map((session) => ({
          ...session,
          groupName: groups.find((group) => group.id === session.groupId)?.groupName ?? null,
        })),
      ),
    [requestedSessionsQuery.data, groups],
  );

  const [isMySessionsPanelCollapsed, setIsMySessionsPanelCollapsed] = useState(false);
  const toggleMySessionsPanelCollapsed = () => setIsMySessionsPanelCollapsed((collapsed) => !collapsed);

  // Upcoming day-group collapse state (`yyyy-MM-dd` keys).
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(() => new Set());
  const toggleDateGroupCollapsed = (dateKey: string) =>
    setCollapsedDateKeys((keys) => {
      const next = new Set(keys);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });

  const upcomingDateGroups = useMemo(
    () => groupSessionsByDate((upcomingQuery.data?.pages ?? []).flatMap((page) => page.content)),
    [upcomingQuery.data],
  );
  const historyDates = useMemo(
    () => (historyDatesQuery.data?.pages ?? []).flatMap((page) => page.dates),
    [historyDatesQuery.data],
  );

  // History rows are collapsed by default; which are expanded is scoped to the sport they were
  // expanded under, so switching pills starts every row collapsed again instead of carrying an
  // expanded state across two unrelated date lists. Derived at render (same render-phase idiom
  // `CreateSessionModal` uses) rather than reset in an effect.
  const [expandedHistory, setExpandedHistory] = useState<{ sportId: number | undefined; dates: Set<string> }>(
    { sportId: undefined, dates: new Set() },
  );
  const expandedHistoryDates = useMemo(
    () => (expandedHistory.sportId === activeSportId ? expandedHistory.dates : new Set<string>()),
    [expandedHistory, activeSportId],
  );
  const toggleHistoryDate = (date: string) =>
    setExpandedHistory({
      sportId: activeSportId,
      dates: new Set(
        expandedHistoryDates.has(date)
          ? [...expandedHistoryDates].filter((expanded) => expanded !== date)
          : [...expandedHistoryDates, date],
      ),
    });

  // "Today" in the viewer's own zone — the browser's local calendar day, the same zone
  // `viewerZoneId` tells the backend to bucket history dates in.
  const today = format(new Date(), 'yyyy-MM-dd');

  // Waiting on the sport profiles that resolve the active sport counts as loading — otherwise a
  // caller whose profiles are still in flight would flash both sections' empty states first.
  const isResolvingActiveSport = activeSportId === undefined && sportProfilesQuery.isLoading;

  // --- Create session ---
  // CLIENT-SESSION-7: extracted into its own hook so Home Feed/Groups/Friends' rail-triggered
  // modal instance and this page's "Create session" button share exactly one implementation.
  const createSessionModalData = useCreateSessionModalData();

  // --- Session detail ---
  // Card-level participation action (SessionCard/SessionDateGroup in the Discover/My
  // sessions lists) — separate mutation instance from the one useSessionDetailModalData owns
  // internally for the modal's own Join/Leave (both invalidate the same sessionKeys.all root, so
  // this is a harmless duplicate, not a correctness issue — see that hook's own doc comment).
  const { onParticipationAction, isParticipationActionPending } = useSessionParticipationAction();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(initialSessionId);
  const sessionDetailData = useSessionDetailModalData(selectedSessionId);

  return {
    activeSport,
    setActiveSport,
    sportsByKey,

    ...discoverFilters,

    activeSportId,
    today,

    upcomingDateGroups,
    isUpcomingLoading: upcomingQuery.isLoading || isResolvingActiveSport,
    isUpcomingError: upcomingQuery.isError,
    hasMoreUpcoming: upcomingQuery.hasNextPage ?? false,
    isFetchingMoreUpcoming: upcomingQuery.isFetchingNextPage,
    onLoadMoreUpcoming: () => upcomingQuery.fetchNextPage(),
    collapsedDateKeys,
    toggleDateGroupCollapsed,

    historyDates,
    isHistoryLoading: historyDatesQuery.isLoading || isResolvingActiveSport,
    isHistoryError: historyDatesQuery.isError,
    hasMoreHistoryDates: historyDatesQuery.hasNextPage ?? false,
    isFetchingMoreHistoryDates: historyDatesQuery.isFetchingNextPage,
    onLoadMoreHistoryDates: () => historyDatesQuery.fetchNextPage(),
    expandedHistoryDates,
    toggleHistoryDate,

    requestedSessions,
    isRequestedSessionsLoading: requestedSessionsQuery.isLoading,
    isRequestedSessionsError: requestedSessionsQuery.isError,
    hasMoreRequestedSessions: requestedSessionsQuery.hasNextPage ?? false,
    isFetchingMoreRequestedSessions: requestedSessionsQuery.isFetchingNextPage,
    onLoadMoreRequestedSessions: () => requestedSessionsQuery.fetchNextPage(),

    isMySessionsPanelCollapsed,
    toggleMySessionsPanelCollapsed,

    ...createSessionModalData,

    selectedSessionId,
    onViewDetails: (sessionId: number) => setSelectedSessionId(sessionId),
    closeDetail: () => setSelectedSessionId(null),
    onParticipationAction,
    isParticipationActionPending,

    ...sessionDetailData,
    // Both `createSessionModalData` and `sessionDetailData` expose a `sessionAttributeSchema`
    // (CLIENT-SESSION-15 for the create form's chosen sport; CLIENT-SESSION-16 for the open
    // session's sport) — the later spread would otherwise shadow the create one with the detail
    // one (null whenever no detail modal is open), so CreateSessionModal's "Session detail"
    // section never rendered on this page. Bind each explicitly: `sessionAttributeSchema` is the
    // create form's (CreateSessionModal), `detailSessionAttributeSchema` the open session's
    // (SessionDetailModal). CLIENT-SESSION-17.
    sessionAttributeSchema: createSessionModalData.sessionAttributeSchema,
    detailSessionAttributeSchema: sessionDetailData.sessionAttributeSchema,
    // SPORT-16: same collision as `sessionAttributeSchema` above — both hooks expose a
    // `refBaseSchema` (the sport's profile schema, for `#ref`→base `layout` inheritance). Bind
    // each explicitly: `refBaseSchema` is the create form's, `detailRefBaseSchema` the open
    // session's.
    refBaseSchema: createSessionModalData.refBaseSchema,
    detailRefBaseSchema: sessionDetailData.refBaseSchema,
    // Overrides sessionDetailData's own currentUserId (which falls back to '' for the modal's
    // prop convention) with the real string | undefined this page's other callers need —
    // MatchesPage.tsx's useAddSportProfile(data.currentUserId) relies on undefined meaning
    // "no user yet", not an empty string.
    currentUserId,
  };
}
