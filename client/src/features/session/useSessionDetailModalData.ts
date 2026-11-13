import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useUserGroups } from '@/features/feed/hooks/useUserGroups';
import { useFavoriteLocation } from '@/features/location/hooks/useFavoriteLocation';
import { useFavoriteLocations } from '@/features/location/hooks/useFavoriteLocations';
import { useUnfavoriteLocation } from '@/features/location/hooks/useUnfavoriteLocation';
import { useLocationPickerData } from '@/features/location/useLocationPickerData';
import { useSessionAttributeSchema } from '@/shared/hooks/useSessionAttributeSchema';
import { useRawMySportProfiles } from '@/shared/hooks/useRawMySportProfiles';
import { useSportAttributeSchema } from '@/shared/hooks/useSportAttributeSchema';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import type { Location } from '@/shared/types/location';
import { useApproveParticipant } from './hooks/useApproveParticipant';
import { useCancelSession } from './hooks/useCancelSession';
import { useLikeSession } from './hooks/useLikeSession';
import { useRejectParticipant } from './hooks/useRejectParticipant';
import { useRequestedParticipants } from './hooks/useRequestedParticipants';
import { useScheduleSession } from './hooks/useScheduleSession';
import { useSession } from './hooks/useSession';
import { useSessionParticipants } from './hooks/useSessionParticipants';
import { useSessionParticipationAction } from './hooks/useSessionParticipationAction';
import { useSessionResultData } from './hooks/useSessionResultData';
import { useUnlikeSession } from './hooks/useUnlikeSession';
import { useUpdateSession } from './hooks/useUpdateSession';
import { missingForSession } from './sessionReadiness';
import { isSessionDialogError, useSessionErrorGuard } from './sessionErrors';
import type { UpdateSessionPayload } from './types';
import { useSessionCommentsData } from './useSessionCommentsData';

const CAN_MANAGE_ROLES = new Set(['group_owner', 'group_admin']);

/**
 * The full `SessionDetailModal` data slice for one selected session — session/participants
 * queries, real `canManage` (creator for a standalone session, owner/admin role for a
 * group-linked one, resolved from the caller's own groups), join/leave/cancel, the
 * canManage-gated approval queue, likes, and the Discussion section. Extracted so
 * `useMatchesPageData` (the Matches page's own detail dialog) and every rail-hosting page's
 * in-place "View details" modal (Home Feed/Groups/Friends, via `useDiscoverModalData` —
 * CLIENT-SESSION-9 follow-up) share one implementation instead of drifting duplicates. Previously
 * `useDiscoverModalData` hardcoded `canManage: false` on the (correct, at the time) assumption
 * that a Discover-sourced session could never be self-managed — that assumption broke once the
 * same detail slice started backing the rail's own sessions too, which genuinely can be ones the
 * caller manages.
 *
 * Owns its own `useSessionParticipationAction()` instance, independent of any card-level one a
 * caller (`useMatchesPageData`) also holds for its list of cards — both invalidate the same
 * `sessionKeys.all` root on success, so this is a harmless duplicate mutation object, not a
 * correctness issue.
 */
export function useSessionDetailModalData(sessionId: number | null, closeDetail?: () => void) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isDetailOpen = sessionId !== null;

  // CLIENT-ERR-7: a dismissed 403 error dialog closes this modal (the user has no right to be in it).
  useSessionErrorGuard(sessionId, closeDetail);

  const sessionQuery = useSession(sessionId ?? undefined, isDetailOpen);
  const participantsQuery = useSessionParticipants(sessionId ?? undefined, isDetailOpen);

  const groupsQuery = useUserGroups(currentUserId);
  const groups = useMemo(() => groupsQuery.data?.content ?? [], [groupsQuery.data]);
  const canManage = useMemo(() => {
    const session = sessionQuery.data;
    if (session === undefined || currentUserId === undefined) return false;
    if (session.groupId === null) return session.createdBy === currentUserId;
    const group = groups.find((candidate) => candidate.id === session.groupId);
    return group?.currentUserRole !== null && CAN_MANAGE_ROLES.has(group?.currentUserRole ?? '');
  }, [sessionQuery.data, currentUserId, groups]);

  // CLIENT-SESSION-30: a join from inside the detail doesn't offer "Open session" on its pop-up.
  const { joinMutation, leaveMutation } = useSessionParticipationAction({ offerOpenSession: false });
  const cancelMutation = useCancelSession();
  const likeMutation = useLikeSession();
  const unlikeMutation = useUnlikeSession();

  // CLIENT-SESSION-4: the approval queue only ever fires for a canManage caller — gating the
  // query on it too (not just hiding the section) avoids a request that would 400 for anyone else.
  const requestedParticipantsQuery = useRequestedParticipants(
    sessionId ?? undefined,
    isDetailOpen && canManage,
  );
  const approveParticipantMutation = useApproveParticipant();
  const rejectParticipantMutation = useRejectParticipant();

  // CLIENT-SESSION-8: the detail dialog's Discussion section.
  const sessionCommentsData = useSessionCommentsData(sessionId ?? undefined, isDetailOpen);

  // CLIENT-SESSION-21 (SESSION-24) / CLIENT-SESSION-34: a PREPARING session's own creator/owner-admin
  // edits it section by section in the detail modal (`SessionDetailSections`). The Where editor's
  // location picking reuses the exact same LocationPicker + favorites plumbing CreateSessionModal
  // already owns, just scoped to this already-known session (the sport never changes here).
  const sessionSportId = sessionQuery.data?.sportId;
  const [selectedCompletionLocation, setSelectedCompletionLocation] = useState<Location | null>(null);
  const [isCompletionLocationPickerOpen, setIsCompletionLocationPickerOpen] = useState(false);
  const completionFavoriteLocationsQuery = useFavoriteLocations(
    sessionSportId,
    isDetailOpen && canManage,
  );
  const completionFavoriteLocationIds = useMemo(
    () => new Set((completionFavoriteLocationsQuery.data?.content ?? []).map((location) => location.id)),
    [completionFavoriteLocationsQuery.data],
  );
  const completionFavoriteLocationMutation = useFavoriteLocation();
  const completionUnfavoriteLocationMutation = useUnfavoriteLocation();
  const toggleCompletionFavoriteLocation = (location: Location) => {
    if (sessionSportId === undefined) return;
    const payload = { locationId: location.id, sportId: sessionSportId };
    if (completionFavoriteLocationIds.has(location.id)) {
      completionUnfavoriteLocationMutation.mutate(payload);
    } else {
      completionFavoriteLocationMutation.mutate(payload);
    }
  };
  // CLIENT-SESSION-23: the same favorites list the picker's hearts use, surfaced as quick picks
  // in SessionPreparingCompletion's LocationFavoritesDropdown (same shape CreateSessionModal's own
  // dropdown gets from useCreateSessionModalData).
  const completionFavorites = {
    locations: completionFavoriteLocationsQuery.data?.content ?? [],
    isLoading: completionFavoriteLocationsQuery.isLoading,
    onSelect: (location: Location) => setSelectedCompletionLocation(location),
  };
  const completionLocationPickerData = useLocationPickerData(
    sessionSportId ?? 0,
    isCompletionLocationPickerOpen,
    (location) => setSelectedCompletionLocation(location),
    () => setIsCompletionLocationPickerOpen(false),
  );
  const completionLocationPicker = {
    isOpen: isCompletionLocationPickerOpen,
    onClose: () => setIsCompletionLocationPickerOpen(false),
    ...completionLocationPickerData,
    favoriteLocationIds: completionFavoriteLocationIds,
    onToggleFavorite: toggleCompletionFavoriteLocation,
    isTogglingFavorite:
      completionFavoriteLocationMutation.isPending || completionUnfavoriteLocationMutation.isPending,
  };
  const updateSessionMutation = useUpdateSession();
  const scheduleMutation = useScheduleSession();
  // CLIENT-SESSION-34: the "Are you ready?" popup (complete variant) that confirms "Mark it
  // scheduled". Opened by the button, and by itself when a save leaves nothing missing.
  const [isScheduleConfirmOpen, setIsScheduleConfirmOpen] = useState(false);
  /**
   * Saves one section's fields (`PUT`). `onDone` runs on success (the section leaves edit mode and the
   * picked location is dropped). When this save was what completed the session — something was missing
   * before and nothing is after — the schedule confirmation opens by itself.
   */
  const onUpdateSession = (payload: UpdateSessionPayload, onDone: () => void) => {
    if (sessionId === null) return;
    const hadMissing = sessionQuery.data !== undefined && missingForSession(sessionQuery.data).length > 0;
    updateSessionMutation.mutate(
      { sessionId, payload },
      {
        onSuccess: (updated) => {
          setSelectedCompletionLocation(null);
          onDone();
          if (hadMissing && updated.status === 'PREPARING' && missingForSession(updated).length === 0) {
            setIsScheduleConfirmOpen(true);
          }
        },
      },
    );
  };
  const onSchedule = () => {
    if (sessionId === null) return;
    scheduleMutation.mutate(sessionId, { onSuccess: () => setIsScheduleConfirmOpen(false) });
  };
  const rawProfiles = useRawMySportProfiles();
  // CLIENT-SESSION-34: the `#ref` fields of the Session detail editor take their choices from the
  // creator's own profile for the session's sport (the create form does the same).
  const refChoiceSource: Record<string, unknown> | null =
    rawProfiles.data?.find((profile) => profile.sportId === sessionSportId && profile.isActive)?.attributes ?? null;

  // CLIENT-SESSION-16: the resolved session attribute schema for this session's sport, so the
  // modal can render the session's stored `attributes` read-only. `null` (not an error) when the
  // sport's sessions carry no attributes; also `null` while the session query is still resolving
  // its `sportId`. `SessionAttributesSummary` renders nothing when there is nothing to show, so
  // the modal mounts it unconditionally.
  const sessionAttributeSchema = useSessionAttributeSchema(sessionQuery.data?.sportId).data;
  // SPORT-16: the sport's *profile* schema — the base a `#ref` node inherits its read-view
  // `layout` from. Shares the `['sportAttributeSchema', sportId]` query cache; `null` until it
  // settles (or when the sport has no profile schema) → no inheritance, defaults render.
  const refBaseSchema = useSportAttributeSchema(sessionQuery.data?.sportId).data;

  // CLIENT-GL-38: the Result section (the sport's record schema, who may edit, the saved records).
  const participantRows = participantsQuery.data?.content;
  const result = useSessionResultData(sessionQuery.data, sessionId, useMemo(() => participantRows ?? [], [participantRows]));

  return {
    /**
     * CLIENT-MODAL-1: clears the join/leave/cancel failures before the dialog closes.
     *
     * Worse here than the plain stale-error case elsewhere: this dialog reopens for a
     * *different* session, so without this a failed join on session A renders its error
     * against session B — an error attributed to the wrong entity, not just a stale one.
     *
     * Only the mutation-backed flags need it. `isSessionError`,
     * `isParticipantsError`, `isRequestedParticipantsError` and `isCommentsError` are all
     * query-derived and re-evaluate on the next fetch, so they cannot go stale this way.
     */
    resetActionErrors: () => {
      joinMutation.reset();
      leaveMutation.reset();
      cancelMutation.reset();
      // CLIENT-SESSION-21: same reasoning — a failed/half-picked completion on session A must
      // not surface (or leave a stale chosen location) when this dialog reopens for session B.
      updateSessionMutation.reset();
      scheduleMutation.reset();
      setIsScheduleConfirmOpen(false);
      setSelectedCompletionLocation(null);
    },
    selectedSession: sessionQuery.data,
    isSessionLoading: sessionQuery.isLoading,
    isSessionError: sessionQuery.isError,
    /** CLIENT-ERR-7: the raw detail-load failure, so the modal can pick the not-found / no-access state. */
    sessionLoadError: sessionQuery.error,
    sessionAttributeSchema,
    // SPORT-16: profile schema for `#ref`→base `layout` inheritance in the read view.
    refBaseSchema,
    participants: participantsQuery.data?.content ?? [],
    /** CLIENT-GL-38: the Result section's data slice. */
    result,
    isParticipantsLoading: participantsQuery.isLoading,
    isParticipantsError: participantsQuery.isError,
    currentUserId: currentUserId ?? '',
    canManage,
    // CLIENT-SESSION-21 (SESSION-24) / CLIENT-SESSION-34: the Where editor's picked location — the
    // sections get Edit buttons only for `canManage && selectedSession.status === 'PREPARING'`.
    selectedCompletionLocation,
    onOpenCompletionLocationPicker: () => setIsCompletionLocationPickerOpen(true),
    completionLocationPicker,
    completionFavorites,
    onClearCompletionLocation: () => setSelectedCompletionLocation(null),
    /** Named apart from the create hook's `refChoiceSource`: `useMatchesPageData` spreads both. */
    detailRefChoiceSource: refChoiceSource,
    /** CLIENT-SESSION-34: saves one section of a PREPARING session (the detail's per-section Edit). */
    onUpdateSession,
    isUpdatingSession: updateSessionMutation.isPending,
    isUpdateSessionError: updateSessionMutation.isError && !isSessionDialogError(updateSessionMutation.error),
    updateSessionErrorText: getCodedErrorMessage(updateSessionMutation.error),
    /** CLIENT-SESSION-34: "Mark it scheduled" (SESSION-46's `POST /schedule`) and its confirmation popup. */
    isScheduleConfirmOpen,
    onScheduleConfirmOpenChange: setIsScheduleConfirmOpen,
    onSchedule,
    isScheduling: scheduleMutation.isPending,
    isScheduleError: scheduleMutation.isError && !isSessionDialogError(scheduleMutation.error),
    scheduleErrorText: getCodedErrorMessage(scheduleMutation.error),
    onJoin: () => sessionId !== null && joinMutation.mutate(sessionId),
    isJoining: joinMutation.isPending,
    isJoinError: joinMutation.isError && !isSessionDialogError(joinMutation.error),
    onLeave: () => sessionId !== null && leaveMutation.mutate(sessionId),
    isLeaving: leaveMutation.isPending,
    isLeaveError: leaveMutation.isError && !isSessionDialogError(leaveMutation.error),
    onConfirmCancel: (reason: string) =>
      sessionId !== null &&
      cancelMutation.mutate({ sessionId, payload: { reason: reason || undefined } }),
    isCancelling: cancelMutation.isPending,
    isCancelError: cancelMutation.isError && !isSessionDialogError(cancelMutation.error),
    onToggleLike: () => {
      if (sessionId === null) return;
      if (sessionQuery.data?.isLikedByCurrentUser) {
        unlikeMutation.mutate(sessionId);
      } else {
        likeMutation.mutate(sessionId);
      }
    },
    isTogglingLike: likeMutation.isPending || unlikeMutation.isPending,

    requestedParticipants: requestedParticipantsQuery.data?.content ?? [],
    isRequestedParticipantsLoading: requestedParticipantsQuery.isLoading,
    isRequestedParticipantsError: requestedParticipantsQuery.isError,
    onApproveParticipant: (userId: string) =>
      sessionId !== null && approveParticipantMutation.mutate({ sessionId, userId }),
    isApprovingParticipant: approveParticipantMutation.isPending,
    onRejectParticipant: (userId: string, reason: string) =>
      sessionId !== null && rejectParticipantMutation.mutate({ sessionId, userId, reason }),
    isRejectingParticipant: rejectParticipantMutation.isPending,

    ...sessionCommentsData,
  };
}
