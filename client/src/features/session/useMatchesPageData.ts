import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import type { Location } from '@/shared/types/location';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useCancelSession } from './hooks/useCancelSession';
import { useCreateSession } from './hooks/useCreateSession';
import { useGroupSessionsForGroups } from './hooks/useGroupSessions';
import { useJoinSession } from './hooks/useJoinSession';
import { useLeaveSession } from './hooks/useLeaveSession';
import { useMySessions } from './hooks/useMySessions';
import { useSession } from './hooks/useSession';
import { useSessionParticipants } from './hooks/useSessionParticipants';
import type { CreateSessionPayload, SessionListItem } from './types';
import type { ManageableGroup } from './components/CreateSessionModal';

const CAN_MANAGE_ROLES = new Set(['group_owner', 'group_admin']);

/**
 * The Matches page's data boundary — composes every session query/mutation this ticket needs
 * (list aggregation, create, detail, join/leave/cancel) plus `LocationPicker`'s data hook for
 * the create form's required location field, so `MatchesPage`/`SessionListCard`/
 * `CreateSessionModal`/`SessionDetailModal` all stay presentational and controlled per
 * `client/CLAUDE.md` — same "mega page-data hook" shape as `useGroupsPageData`/`useHomeFeedData`.
 *
 * `initialSessionId` seeds the detail dialog open on mount for the rail card's
 * `?session={id}` deep link (same `useParams`-seeds-page-state precedent FEED-12 established
 * for `/posts/:postId`, via a query param instead of a path segment since the primary
 * interaction shape here is a dialog, not a route — see CLIENT-SESSION-1's design decision).
 *
 * There is no batch "sessions across my groups" endpoint (a real backend gap, flagged in
 * CLIENT-SESSION-1's implementation summary), so the list fans out one query per group via
 * `useGroupSessionsForGroups` and merges with the caller's own standalone sessions
 * (`useMySessions` — creator-only, not "sessions I joined"; another flagged gap).
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

  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => groupsQuery.data?.content ?? [], [groupsQuery.data]);
  const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);
  const groupSessionQueries = useGroupSessionsForGroups(groupIds);
  const mySessionsQuery = useMySessions(currentUserId !== undefined);

  const sessions = useMemo<SessionListItem[]>(() => {
    const fromGroups = groupSessionQueries.flatMap((query) => query.data?.content ?? []);
    const mine = mySessionsQuery.data?.content ?? [];
    const withGroupName = [...fromGroups, ...mine].map((session) => ({
      ...session,
      groupName: groups.find((group) => group.id === session.groupId)?.groupName ?? null,
    }));
    return withGroupName
      .filter(
        (session) => activeSport === 'all' || sportKeyForId(session.sportId) === activeSport,
      )
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  }, [groupSessionQueries, mySessionsQuery.data, groups, activeSport]);

  const manageableGroups = useMemo<ManageableGroup[]>(
    () =>
      groups
        .filter((group) => group.currentUserRole !== null && CAN_MANAGE_ROLES.has(group.currentUserRole))
        .map((group) => ({ id: group.id, groupName: group.groupName, sportId: group.sportId })),
    [groups],
  );

  const isLoading =
    groupsQuery.isLoading || mySessionsQuery.isLoading || groupSessionQueries.some((query) => query.isLoading);
  const isError =
    groupsQuery.isError || mySessionsQuery.isError || groupSessionQueries.some((query) => query.isError);

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
  };

  const createSessionMutation = useCreateSession();
  const submitCreate = (payload: CreateSessionPayload) => {
    createSessionMutation.mutate(payload, { onSuccess: closeCreateModal });
  };

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

  return {
    activeSport,
    setActiveSport,
    sportsByKey,
    sessions,
    isLoading,
    isError,

    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    manageableGroups,
    selectedLocationForCreate,
    onOpenLocationPickerForCreate: (sportId: number) => {
      setCreateFormSportId(sportId);
      setIsCreateLocationPickerOpen(true);
    },
    locationPickerForCreate,
    submitCreate,
    isCreating: createSessionMutation.isPending,
    isCreateError: createSessionMutation.isError,

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
  };
}
