import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { filterDiscoverSessions } from './discoverSearch';
import { useDiscoverSessions } from './hooks/useDiscoverSessions';
import { useJoinSession } from './hooks/useJoinSession';
import { useLeaveSession } from './hooks/useLeaveSession';
import { useLikeSession } from './hooks/useLikeSession';
import { useSession } from './hooks/useSession';
import { useSessionParticipants } from './hooks/useSessionParticipants';
import { useUnlikeSession } from './hooks/useUnlikeSession';
import { useSessionCommentsData } from './useSessionCommentsData';
import type { SessionListItem, SessionSearchMode } from './types';

const noop = () => {};

/**
 * Data boundary for `SessionDiscoverModal` — the rail's "Join a match" entry point on Home
 * Feed/Groups/Friends (CLIENT-SESSION-7). Self-contained (unlike `useMatchesPageData`, this
 * owns only one modal's worth of state): open/close, the Discover search/results, and a
 * session-detail slice for whichever session the caller selects. `sportId` scopes the Discover
 * query to the hosting page's active sport pill (`undefined` — every active sport — on pages
 * with no switcher, e.g. `FriendsPage`).
 *
 * `canManage` is hardcoded `false`: `GET /sessions/discover` is standalone-only and already
 * excludes sessions the caller created, so a session reached from here can never be one the
 * caller manages. The cancel/approval-queue props below are therefore inert stubs —
 * `SessionDetailModal` never renders that UI when `canManage` is false.
 */
export function useDiscoverModalData(sportId: number | undefined) {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false);
  const openDiscoverModal = () => setIsDiscoverModalOpen(true);
  const closeDiscoverModal = () => setIsDiscoverModalOpen(false);

  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SessionSearchMode>('sessions');
  const discoverQuery = useDiscoverSessions(sportId, isDiscoverModalOpen);
  const discoverSessions = useMemo<SessionListItem[]>(
    () => filterDiscoverSessions(discoverQuery.data?.content ?? [], searchMode, searchText),
    [discoverQuery.data, searchMode, searchText],
  );

  // Selecting a session closes this modal and opens the detail one — same "close one Dialog,
  // then open the next" stacking pattern HashtagPostsModal/CommentSection already use, rather
  // than nesting two Radix Dialogs (the nesting pattern that broke CreateSessionModal's earlier
  // favorites-dropdown/wheel-picker attempts).
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const onViewDetails = (sessionId: number) => {
    setIsDiscoverModalOpen(false);
    setSelectedSessionId(sessionId);
  };
  const closeDetail = () => setSelectedSessionId(null);
  const isDetailOpen = selectedSessionId !== null;
  const sessionQuery = useSession(selectedSessionId ?? undefined, isDetailOpen);
  const participantsQuery = useSessionParticipants(selectedSessionId ?? undefined, isDetailOpen);

  const joinMutation = useJoinSession();
  const leaveMutation = useLeaveSession();
  const likeMutation = useLikeSession();
  const unlikeMutation = useUnlikeSession();

  // CLIENT-SESSION-8: the detail dialog's Discussion section. A session reached from Discover
  // is, by construction, one the caller hasn't joined — the comments GET will legitimately 403
  // for most of them, and `isCommentsForbidden` correctly hides the section; no special-casing
  // needed here beyond calling the same hook `useMatchesPageData` uses.
  const sessionCommentsData = useSessionCommentsData(selectedSessionId ?? undefined, isDetailOpen);

  return {
    isDiscoverModalOpen,
    openDiscoverModal,
    closeDiscoverModal,
    searchText,
    setSearchText,
    searchMode,
    setSearchMode,
    discoverSessions,
    isDiscoverLoading: discoverQuery.isLoading,
    isDiscoverError: discoverQuery.isError,
    onViewDetails,

    selectedSessionId,
    closeDetail,
    selectedSession: sessionQuery.data,
    isSessionLoading: sessionQuery.isLoading,
    isSessionError: sessionQuery.isError,
    participants: participantsQuery.data?.content ?? [],
    isParticipantsLoading: participantsQuery.isLoading,
    isParticipantsError: participantsQuery.isError,
    currentUserId: currentUserId ?? '',
    canManage: false,
    onJoin: () => selectedSessionId !== null && joinMutation.mutate(selectedSessionId),
    isJoining: joinMutation.isPending,
    isJoinError: joinMutation.isError,
    onLeave: () => selectedSessionId !== null && leaveMutation.mutate(selectedSessionId),
    isLeaving: leaveMutation.isPending,
    isLeaveError: leaveMutation.isError,
    // Real, not inert (unlike cancel/approval below) — SESSION_POST like gates on the same
    // SessionGate as the Discussion section, which isn't structurally guaranteed false for a
    // Discover-sourced session (a REQUESTED/INVITED row doesn't exclude it from Discover, only
    // JOINED/self-created do — see CLIENT-SESSION-6). A caller without access simply gets a
    // 403 the mutation doesn't surface, same accepted gap as clicking Join on a session that
    // just filled up elsewhere.
    onToggleLike: () => {
      if (selectedSessionId === null) return;
      if (sessionQuery.data?.isLikedByCurrentUser) {
        unlikeMutation.mutate(selectedSessionId);
      } else {
        likeMutation.mutate(selectedSessionId);
      }
    },
    isTogglingLike: likeMutation.isPending || unlikeMutation.isPending,

    // Inert — canManage is always false, so SessionDetailModal never renders cancel/approval UI.
    onConfirmCancel: noop,
    isCancelling: false,
    isCancelError: false,
    requestedParticipants: [],
    isRequestedParticipantsLoading: false,
    isRequestedParticipantsError: false,
    onApproveParticipant: noop,
    isApprovingParticipant: false,
    onRejectParticipant: noop,
    isRejectingParticipant: false,

    ...sessionCommentsData,
  };
}
