import { useMemo, useState } from 'react';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { filterDiscoverSessions } from './discoverSearch';
import { useDiscoverSessions } from './hooks/useDiscoverSessions';
import { useSessionParticipationAction } from './hooks/useSessionParticipationAction';
import { useSessionDetailModalData } from './useSessionDetailModalData';
import type { SessionListItem, SessionSearchMode } from './types';

/**
 * Data boundary for `SessionDiscoverModal` — the rail's "Join a match" entry point on Home
 * Feed/Groups/Friends (CLIENT-SESSION-7). Self-contained (unlike `useMatchesPageData`, this
 * owns only one modal's worth of state): open/close, the Discover search/results, and a
 * session-detail slice (`useSessionDetailModalData`) for whichever session the caller selects.
 * `sportId` scopes the Discover query to the hosting page's active sport pill (`undefined` —
 * every active sport — on pages with no switcher, e.g. `FriendsPage`).
 *
 * The same `onViewDetails`/detail slice also backs `UpcomingMatches`' own "View details" button
 * on these three pages (a CLIENT-SESSION-9 follow-up — that button used to navigate to
 * `/matches?session={id}` instead of opening the modal in place). `useSessionDetailModalData`
 * resolves real `canManage` (not hardcoded false — an earlier version of this hook did, on the
 * since-broken assumption that a session reached from here could never be self-managed; true for
 * a genuine Discover-sourced session, since `GET /sessions/discover` excludes sessions the caller
 * created, but false for a rail-sourced one, which genuinely can be one the caller manages) — so
 * Cancel session / the approval queue now work here too, same as the Matches page's own modal.
 */
export function useDiscoverModalData(sportId: number | undefined) {
  const sportCatalog = useSportCatalog();
  const [isDiscoverModalOpen, setIsDiscoverModalOpen] = useState(false);
  const openDiscoverModal = () => {
  // SPORT-5: this modal embeds the zero-sport-profile gate, which lists the catalogue the
  // same way the "Add sport" pill does — so it needs the same freshness. No pill to hang a
  // re-read on here, so opening the modal is the trigger. Fire-and-forget: the gate renders
  // from cached data immediately and updates if the re-read brings something new, which is
  // safe because nothing is *hidden* by being slightly late, unlike the pill's open/dialog
  // decision.
  void sportCatalog.refetch();
    setIsDiscoverModalOpen(true);
  };
  const closeDiscoverModal = () => setIsDiscoverModalOpen(false);

  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState<SessionSearchMode>('sessions');
  const discoverQuery = useDiscoverSessions(sportId, isDiscoverModalOpen);
  const discoverSessions = useMemo<SessionListItem[]>(
    () => filterDiscoverSessions(discoverQuery.data?.content ?? [], searchMode, searchText),
    [discoverQuery.data, searchMode, searchText],
  );

  // Card-level participation action (SessionCard in the Discover results grid) — separate
  // mutation instance from the one useSessionDetailModalData owns internally for the modal's own
  // Join/Leave (both invalidate the same sessionKeys.all root — harmless duplicate, see that
  // hook's own doc comment).
  const { onParticipationAction, isParticipationActionPending } = useSessionParticipationAction();

  // Selecting a session closes this modal and opens the detail one — same "close one Dialog,
  // then open the next" stacking pattern HashtagPostsModal/CommentSection already use, rather
  // than nesting two Radix Dialogs (the nesting pattern that broke CreateSessionModal's earlier
  // favorites-dropdown/wheel-picker attempts).
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const onViewDetails = (sessionId: number) => {
    setIsDiscoverModalOpen(false);
    setSelectedSessionId(sessionId);
  };
  const sessionDetailData = useSessionDetailModalData(selectedSessionId);
  const closeDetail = () => {
    // CLIENT-MODAL-1: this dialog reopens for a different session, so a join/leave/cancel
    // failure left un-reset would surface against whichever session is opened next.
    sessionDetailData.resetActionErrors();
    setSelectedSessionId(null);
  };

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
    onParticipationAction,
    isParticipationActionPending,

    selectedSessionId,
    closeDetail,

    ...sessionDetailData,
  };
}
