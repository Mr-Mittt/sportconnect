import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { sportIdForKey, sportKeyForId } from '@/features/feed/sportIdMap';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useDiscoverSessions } from './hooks/useDiscoverSessions';
import { useGroupSessionsForGroups } from './hooks/useGroupSessions';
import { useJoinedSessions } from './hooks/useJoinedSessions';
import { useMySessions } from './hooks/useMySessions';
import { useSessionParticipationAction } from './hooks/useSessionParticipationAction';
import { dedupeSessionsById, groupSessionsByDate } from './groupSessionsByDate';
import { filterDiscoverSessions } from './discoverSearch';
import { useCreateSessionModalData } from './useCreateSessionModalData';
import { useSessionDetailModalData } from './useSessionDetailModalData';
import type { SessionListItem, SessionSearchMode } from './types';

/**
 * The Matches page's data boundary — composes every session query/mutation this ticket needs
 * (discover + "My sessions" list aggregation, create, detail, join/leave/cancel) plus
 * `LocationPicker`'s data hook for the create form's required location field, so
 * `MatchesPage`/`SessionListCard`/`CreateSessionModal`/`SessionDetailModal` all stay
 * presentational and controlled per `client/CLAUDE.md` — same "mega page-data hook" shape as
 * `useGroupsPageData`/`useHomeFeedData`.
 *
 * `initialSessionId` seeds the detail dialog open on mount for the rail card's
 * `?session={id}` deep link (same `useParams`-seeds-page-state precedent FEED-12 established
 * for `/posts/:postId`, via a query param instead of a path segment since the primary
 * interaction shape here is a dialog, not a route — see CLIENT-SESSION-1's design decision).
 *
 * CLIENT-SESSION-6 split the old single merged list into two panels:
 *  - **Discover** (`useDiscoverSessions`) — joinable SCHEDULED sessions from other users,
 *    scoped by the active sport switcher pill.
 *  - **My sessions** — everything the caller created, manages via a group, or has joined, any
 *    status, grouped by calendar day. There's still no batch "sessions across my groups"
 *    endpoint (a real backend gap, flagged in CLIENT-SESSION-1's implementation summary), so
 *    this fans out one query per group via `useGroupSessionsForGroups`, merged with `mine`
 *    (creator-only standalone sessions — kept even though a standalone creator auto-JOINs,
 *    because a creator who later *leaves* their own session would otherwise disappear from
 *    "My sessions" entirely) and `useJoinedSessions` (every status the caller has a JOINED row
 *    for — the piece that makes a session joined via Discover show up here afterward). These
 *    three sources legitimately overlap (a self-created standalone session is in both `mine`
 *    and `joined`), so the merge runs through `dedupeSessionsById` before grouping.
 */
export function useMatchesPageData(initialSessionId: number | null) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const activeSport = useMatchesPageStore((state) => state.activeSport);
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

  const activeSportId = activeSport === 'all' ? undefined : sportIdForKey(activeSport);

  // --- Discover panel ---
  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SessionSearchMode>('sessions');
  const discoverQuery = useDiscoverSessions(activeSportId, currentUserId !== undefined);
  const discoverSessions = useMemo<SessionListItem[]>(
    () => filterDiscoverSessions(discoverQuery.data?.content ?? [], searchMode, searchText),
    [discoverQuery.data, searchMode, searchText],
  );

  // --- "My sessions" panel ---
  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => groupsQuery.data?.content ?? [], [groupsQuery.data]);
  const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);
  const groupSessionQueries = useGroupSessionsForGroups(groupIds);
  const mySessionsQuery = useMySessions(currentUserId !== undefined);
  const joinedSessionsQuery = useJoinedSessions(currentUserId !== undefined);

  const [isHistoryPanelCollapsed, setIsHistoryPanelCollapsed] = useState(false);
  const toggleHistoryPanelCollapsed = () => setIsHistoryPanelCollapsed((collapsed) => !collapsed);
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

  const mySessionDateGroups = useMemo(() => {
    const fromGroups = groupSessionQueries.flatMap((query) => query.data?.content ?? []);
    const mine = mySessionsQuery.data?.content ?? [];
    const joined = joinedSessionsQuery.data?.content ?? [];
    const withGroupName = [...fromGroups, ...mine, ...joined].map((session) => ({
      ...session,
      groupName: groups.find((group) => group.id === session.groupId)?.groupName ?? null,
    }));
    const deduped = dedupeSessionsById(withGroupName);
    const filtered = deduped.filter(
      (session) => activeSport === 'all' || sportKeyForId(session.sportId) === activeSport,
    );
    return groupSessionsByDate(filtered);
  }, [groupSessionQueries, mySessionsQuery.data, joinedSessionsQuery.data, groups, activeSport]);

  const isDiscoverLoading = discoverQuery.isLoading;
  const isDiscoverError = discoverQuery.isError;
  const isMySessionsLoading =
    groupsQuery.isLoading ||
    mySessionsQuery.isLoading ||
    joinedSessionsQuery.isLoading ||
    groupSessionQueries.some((query) => query.isLoading);
  const isMySessionsError =
    groupsQuery.isError ||
    mySessionsQuery.isError ||
    joinedSessionsQuery.isError ||
    groupSessionQueries.some((query) => query.isError);

  // --- Create session ---
  // CLIENT-SESSION-7: extracted into its own hook so Home Feed/Groups/Friends' rail-triggered
  // modal instance and this page's "Create session" button share exactly one implementation.
  const createSessionModalData = useCreateSessionModalData();

  // --- Session detail ---
  // Card-level participation action (SessionListCard/SessionDateGroup in the Discover/My
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

    discoverSessions,
    isDiscoverLoading,
    isDiscoverError,
    searchText,
    setSearchText,
    searchMode,
    setSearchMode,

    mySessionDateGroups,
    isMySessionsLoading,
    isMySessionsError,
    isHistoryPanelCollapsed,
    toggleHistoryPanelCollapsed,
    collapsedDateKeys,
    toggleDateGroupCollapsed,

    ...createSessionModalData,

    selectedSessionId,
    onViewDetails: (sessionId: number) => setSelectedSessionId(sessionId),
    closeDetail: () => setSelectedSessionId(null),
    onParticipationAction,
    isParticipationActionPending,

    ...sessionDetailData,
    // Overrides sessionDetailData's own currentUserId (which falls back to '' for the modal's
    // prop convention) with the real string | undefined this page's other callers need —
    // MatchesPage.tsx's useAddSportProfile(data.currentUserId) relies on undefined meaning
    // "no user yet", not an empty string.
    currentUserId,
  };
}
