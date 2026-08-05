import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { useFriends } from '@/features/friends/hooks/useFriends';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import type { Location } from '@/shared/types/location';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useApproveParticipant } from './hooks/useApproveParticipant';
import { useCancelSession } from './hooks/useCancelSession';
import { useCreateSession } from './hooks/useCreateSession';
import { useDiscoverSessions } from './hooks/useDiscoverSessions';
import { useGroupSessionsForGroups } from './hooks/useGroupSessions';
import { useJoinedSessions } from './hooks/useJoinedSessions';
import { useJoinSession } from './hooks/useJoinSession';
import { useLeaveSession } from './hooks/useLeaveSession';
import { useMySessions } from './hooks/useMySessions';
import { useRejectParticipant } from './hooks/useRejectParticipant';
import { useRequestedParticipants } from './hooks/useRequestedParticipants';
import { useSession } from './hooks/useSession';
import { useSessionParticipants } from './hooks/useSessionParticipants';
import { dedupeSessionsById, groupSessionsByDate } from './groupSessionsByDate';
import type { CreateSessionPayload, SessionListItem, SessionSearchMode } from './types';

const CAN_MANAGE_ROLES = new Set(['group_owner', 'group_admin']);

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

  const activeSportId = activeSport === 'all' ? undefined : SPORT_ID_BY_KEY[activeSport];

  // --- Discover panel ---
  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SessionSearchMode>('sessions');
  const discoverQuery = useDiscoverSessions(activeSportId, currentUserId !== undefined);
  const discoverSessions = useMemo<SessionListItem[]>(() => {
    const content = discoverQuery.data?.content ?? [];
    const withGroupName = content.map((session) => ({ ...session, groupName: null }));
    // "Location"/"Gear" search modes have no wired behavior yet (no gear/equipment domain
    // exists in this app — client/CLAUDE.md) — only "Sessions" actually filters.
    const query = searchMode === 'sessions' ? searchText.trim().toLowerCase() : '';
    if (query === '') return withGroupName;
    return withGroupName.filter((session) => {
      const title = session.title ?? `${session.sportName} session`;
      return (
        title.toLowerCase().includes(query) || session.location.name.toLowerCase().includes(query)
      );
    });
  }, [discoverQuery.data, searchMode, searchText]);

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateLocationPickerOpen, setIsCreateLocationPickerOpen] = useState(false);
  const [createFormSportId, setCreateFormSportId] = useState<number | null>(null);
  const [selectedLocationForCreate, setSelectedLocationForCreate] = useState<Location | null>(null);

  const openCreateModal = () => setIsCreateModalOpen(true);
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setSelectedLocationForCreate(null);
    setCreateFormSportId(null);
  };

  // CLIENT-SESSION-5: the favorites dropdown needs to be scoped to whatever sport is *currently
  // selected in the still-open, uncommitted create form* — CreateSessionModal owns that Sport
  // field as its own local state (per its documented "owns its own transient form state"
  // precedent), so it reports the currently-effective sportId up via this callback purely for
  // query-scoping, without the field itself being lifted/controlled here. Reuses
  // `createFormSportId` (already populated by `onOpenLocationPickerForCreate` below) as the same
  // single source of truth for both the dropdown and `useLocationPickerData`.
  const onEffectiveSportChangeForCreate = (sportId: number | undefined) =>
    setCreateFormSportId(sportId ?? null);
  const favoriteLocationsQuery = useFavoriteLocations(createFormSportId ?? undefined, isCreateModalOpen);
  const favoriteLocationIds = useMemo(
    () => new Set((favoriteLocationsQuery.data?.content ?? []).map((location) => location.id)),
    [favoriteLocationsQuery.data],
  );
  const favoriteLocationMutation = useFavoriteLocation();
  const unfavoriteLocationMutation = useUnfavoriteLocation();
  const toggleFavoriteLocation = (location: Location) => {
    if (createFormSportId === null) return;
    const payload = { locationId: location.id, sportId: createFormSportId };
    if (favoriteLocationIds.has(location.id)) {
      unfavoriteLocationMutation.mutate(payload);
    } else {
      favoriteLocationMutation.mutate(payload);
    }
  };

  const locationPickerData = useLocationPickerData(
    createFormSportId ?? SPORT_ID_BY_KEY.football,
    isCreateLocationPickerOpen,
    (location) => setSelectedLocationForCreate(location),
    () => setIsCreateLocationPickerOpen(false),
  );
  // useLocationPickerData returns only its *derived* state/handlers — isOpen/onClose are the
  // inputs it was given, not part of its return value, so LocationPicker's full prop set is
  // assembled here rather than in the page component.
  const locationPickerForCreate = {
    isOpen: isCreateLocationPickerOpen,
    onClose: () => setIsCreateLocationPickerOpen(false),
    ...locationPickerData,
    favoriteLocationIds,
    onToggleFavorite: toggleFavoriteLocation,
    isTogglingFavorite: favoriteLocationMutation.isPending || unfavoriteLocationMutation.isPending,
  };

  const createSessionMutation = useCreateSession();
  const submitCreate = (payload: CreateSessionPayload) => {
    createSessionMutation.mutate(payload, { onSuccess: closeCreateModal });
  };

  // CLIENT-SESSION-4: only needed while the create form is open — the "Invite your friend"
  // field's client-side search is a filter over this full unpaginated list, no new endpoint.
  const friendsQuery = useFriends(isCreateModalOpen);

  // --- Session detail ---
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(initialSessionId);
  const isDetailOpen = selectedSessionId !== null;
  const sessionQuery = useSession(selectedSessionId ?? undefined, isDetailOpen);
  const participantsQuery = useSessionParticipants(selectedSessionId ?? undefined, isDetailOpen);

  const canManageSelected = useMemo(() => {
    const session = sessionQuery.data;
    if (session === undefined || currentUserId === undefined) return false;
    if (session.groupId === null) return session.createdBy === currentUserId;
    const group = groups.find((candidate) => candidate.id === session.groupId);
    return group?.currentUserRole !== null && CAN_MANAGE_ROLES.has(group?.currentUserRole ?? '');
  }, [sessionQuery.data, currentUserId, groups]);

  const joinMutation = useJoinSession();
  const leaveMutation = useLeaveSession();
  const cancelMutation = useCancelSession();

  // CLIENT-SESSION-4: the approval queue only ever fires for a canManage caller — gating the
  // query on it too (not just hiding the section) avoids a request that would 400 for anyone else.
  const requestedParticipantsQuery = useRequestedParticipants(
    selectedSessionId ?? undefined,
    isDetailOpen && canManageSelected,
  );
  const approveParticipantMutation = useApproveParticipant();
  const rejectParticipantMutation = useRejectParticipant();

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

    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    selectedLocationForCreate,
    onOpenLocationPickerForCreate: (sportId: number) => {
      setCreateFormSportId(sportId);
      setIsCreateLocationPickerOpen(true);
    },
    locationPickerForCreate,
    submitCreate,
    isCreating: createSessionMutation.isPending,
    isCreateError: createSessionMutation.isError,
    friends: friendsQuery.data ?? [],
    isFriendsLoading: friendsQuery.isLoading,
    onEffectiveSportChangeForCreate,
    favoriteLocationsForCreate: favoriteLocationsQuery.data?.content ?? [],
    isFavoriteLocationsLoading: favoriteLocationsQuery.isLoading,
    // CLIENT-SESSION-5: selecting a favorite straight from the dropdown bypasses the full
    // LocationPicker flow entirely — same setter useLocationPickerData's own onSelect uses, just
    // called directly since there's no picker dialog to also close here.
    onSelectLocationForCreate: setSelectedLocationForCreate,

    selectedSessionId,
    onViewDetails: (sessionId: number) => setSelectedSessionId(sessionId),
    closeDetail: () => setSelectedSessionId(null),
    selectedSession: sessionQuery.data,
    isSessionLoading: sessionQuery.isLoading,
    isSessionError: sessionQuery.isError,
    participants: participantsQuery.data?.content ?? [],
    isParticipantsLoading: participantsQuery.isLoading,
    isParticipantsError: participantsQuery.isError,
    currentUserId,
    canManageSelected,
    onJoin: () => selectedSessionId !== null && joinMutation.mutate(selectedSessionId),
    isJoining: joinMutation.isPending,
    isJoinError: joinMutation.isError,
    onLeave: () => selectedSessionId !== null && leaveMutation.mutate(selectedSessionId),
    isLeaving: leaveMutation.isPending,
    isLeaveError: leaveMutation.isError,
    onConfirmCancel: (reason: string) =>
      selectedSessionId !== null &&
      cancelMutation.mutate({ sessionId: selectedSessionId, payload: { reason: reason || undefined } }),
    isCancelling: cancelMutation.isPending,
    isCancelError: cancelMutation.isError,

    requestedParticipants: requestedParticipantsQuery.data?.content ?? [],
    isRequestedParticipantsLoading: requestedParticipantsQuery.isLoading,
    isRequestedParticipantsError: requestedParticipantsQuery.isError,
    onApproveParticipant: (userId: string) =>
      selectedSessionId !== null &&
      approveParticipantMutation.mutate({ sessionId: selectedSessionId, userId }),
    isApprovingParticipant: approveParticipantMutation.isPending,
    onRejectParticipant: (userId: string, reason: string) =>
      selectedSessionId !== null &&
      rejectParticipantMutation.mutate({ sessionId: selectedSessionId, userId, reason }),
    isRejectingParticipant: rejectParticipantMutation.isPending,
  };
}
