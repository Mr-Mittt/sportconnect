import { useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { CreateSessionModal } from '@/features/session/components/CreateSessionModal';
import { SessionDetailModal } from '@/features/session/components/SessionDetailModal';
import { SessionDiscoverModal } from '@/features/session/components/SessionDiscoverModal';
import { useSessionParticipationAction } from '@/features/session/hooks/useSessionParticipationAction';
import { useCreateSessionModalData } from '@/features/session/useCreateSessionModalData';
import { useDiscoverModalData } from '@/features/session/useDiscoverModalData';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import { useAnchorBottom, ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { FriendChatPanel } from './components/FriendChatPanel';
import { FriendProfilePanel } from './components/FriendProfilePanel';
import { FriendRail } from './components/FriendRail';
import { FriendRequestUnavailableDialog } from './components/FriendRequestUnavailableDialog';
import { useFriendsPageData } from './useFriendsPageData';

const noop = () => {};

/**
 * FRIEND-1's page assembly: `AppShell` already renders TopBar/NavTabs (this
 * page only assembles the content area, same convention HF-7 established).
 * Right rail (Upcoming/Trending/Broadcasts) is unchanged from Home
 * Feed/Groups — these three hooks are page-independent already, no
 * dedicated mega page-data hook needed for them here.
 *
 * `UpcomingMatches` is given `activeSport="all"` unconditionally — the
 * design reference's friends-view renders its Upcoming rail unfiltered
 * (`renderUpcoming('upcoming-friends')` with no sport-filter argument),
 * unlike Home Feed/Groups which filter by the shared `activeSport`. This
 * page has no sport switcher at all.
 *
 * CLIENT-NOTIF-5: a clicked friend-request notification navigates here with the
 * counterparty's user id in `location.state.focusPersonId`; `useFriendsPageData`
 * pre-selects them, or reports `focusUnavailable` (request gone / account
 * deactivated) which renders `FriendRequestUnavailableDialog`. The state is
 * stripped from history right after so a reload doesn't re-focus.
 *
 * `FriendContent` (profile + chat) is keyed by `selectedPersonId` so both
 * panels remount on every selection change — resets `FriendProfilePanel`'s
 * local Achievements-collapsed toggle, and (since CHAT-9) is what drives
 * `FriendChatPanel`'s `useDirectChatData` WebSocket connect/disconnect per
 * person, same "remount via key" precedent `GroupChatTab` uses per group.
 *
 * CLIENT-SESSION-7: the only rail-hosting page with no pill row/cover banner to anchor a modal
 * below — `ModalAnchorProvider` here is anchored to the page's own (visually hidden) `h1`
 * instead, which keeps `CreateSessionModal`/`SessionDiscoverModal` positioned just under the
 * TopBar/NavTabs shell like every other page's modals, without adding a visible UI element.
 * `useDiscoverModalData` is given `sportId: undefined` (this page has no sport pill to scope
 * it) — the backend already treats that as "every active sport."
 */
export function FriendsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // CLIENT-NOTIF-5: a clicked friend-request notification lands here with the
  // counterparty's user id in router state. It's read live (not copied into
  // state) so `useFriendsPageData` can pre-select that person or report
  // `focusUnavailable`; the state persists on this history entry until the
  // "unavailable" dialog is dismissed (`clearFocusState`) or the user navigates
  // away, at which point `focusUnavailable` derives back to false on its own.
  const focusPersonId = (location.state as { focusPersonId?: string } | null)?.focusPersonId;
  const data = useFriendsPageData(focusPersonId);
  const clearFocusState = () => navigate(location.pathname, { replace: true, state: null });

  const user = useAuthStore((state) => state.user)!;

  const upcomingMatchesQuery = useUpcomingMatches();
  const hashtagsQuery = useTrendingHashtags();
  const broadcastsQuery = useGroupBroadcasts();
  const sportProfilesQuery = useSportProfiles();
  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
  );

  const createSessionModalData = useCreateSessionModalData();
  const discoverModalData = useDiscoverModalData(undefined);
  // CLIENT-SESSION-9: separate instance from discoverModalData's own — this one backs the rail
  // card's action button, that one backs the Discover modal's result-grid cards.
  const railParticipationAction = useSessionParticipationAction();

  // CLIENT-SESSION-7 follow-up: no existing "Add sport" entry point on this page (no
  // SportSwitcher pill row) — this mutation/list exists solely for the zero-sport-profiles gate
  // inside CreateSessionModal/SessionDiscoverModal, same computation every other page already
  // does for its own SportSwitcher "+" pill.
  const addSportMutation = useAddSportProfile(user.id);

  // CLIENT-MODAL-1: both modals embed the zero-sport-profile gate, which renders
  // `addSportMutation.isError` — so their close has to clear it too, not just
  // AddSportModal's. Each hook's own close already resets the mutation it owns.
  // FriendsPage renders no standalone AddSportModal at all — these two nested gates
  // are the only surfaces here that can show an add-sport error.
  const closeCreateSessionModal = () => {
    addSportMutation.reset();
    createSessionModalData.closeCreateModal();
  };
  const closeDiscoverModal = () => {
    addSportMutation.reset();
    discoverModalData.closeDiscoverModal();
  };
  const sportCatalog = useSportCatalog();
  const availableSports = useMemo(
    () =>
      sportCatalog.data.map((sport) => sport.key).filter((key) => !Object.keys(sportsByKey).includes(key)),
    [sportCatalog.data, sportsByKey],
  );

  const h1Ref = useRef<HTMLHeadingElement>(null);
  const modalAnchorBottom = useAnchorBottom(h1Ref);

  return (
    <ModalAnchorProvider value={modalAnchorBottom}>
      <main className="py-4">
        <h1 ref={h1Ref} className="sr-only">
          Friends
        </h1>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[2.1fr_0.9fr]">
          <div className="flex min-w-0 flex-col gap-3.5 sm:flex-row">
            <FriendRail
              query={data.query}
              onQueryChange={data.setQuery}
              onClear={data.clearQuery}
              isAddMode={data.isAddMode}
              onToggleAddMode={data.toggleAddMode}
              onBack={data.clearQuery}
              collapsedSections={data.collapsedSections}
              onToggleSection={data.toggleSection}
              onlineFriends={data.onlineFriends}
              friendRequestRows={data.friendRequestRows}
              totalFriendRequestsCount={data.totalFriendRequestsCount}
              offlineFriends={data.offlineFriends}
              totalFriendsCount={data.totalFriendsCount}
              blockedFriends={data.blockedFriends}
              selectedPersonId={data.selectedPersonId}
              onSelectPerson={data.selectPerson}
              searchResults={data.searchResults}
              isSearching={data.isSearching}
              isSearchError={data.isSearchError}
            />
            <div className="min-w-0 flex-1">
              {(() => {
                const { selectedPerson } = data;
                if (selectedPerson === undefined) {
                  return (
                    <div className="border-hairline flex h-160 items-center justify-center rounded-xl border-border bg-surface-2 text-2sm text-text-muted">
                      Select a friend to view their profile and chat.
                    </div>
                  );
                }
                const { requestId } = selectedPerson;
                return (
                  <div key={selectedPerson.id} className="flex h-160 flex-col gap-3.5">
                    <div className="h-1/2 min-h-0">
                      <FriendProfilePanel
                        person={selectedPerson}
                        sports={data.selectedSports}
                        isSportsLoading={data.isSelectedSportsLoading}
                        onSendRequest={() => data.sendRequest(selectedPerson.id)}
                        onAccept={() => requestId !== null && data.acceptRequest(requestId)}
                        onDecline={() => requestId !== null && data.declineRequest(requestId)}
                        onCancel={() => requestId !== null && data.cancelRequest(requestId)}
                        isActionPending={
                          data.isSendingRequest ||
                          data.isAcceptingRequest ||
                          data.isDecliningRequest ||
                          data.isCancellingRequest
                        }
                      />
                    </div>
                    <div className="h-1/2 min-h-0">
                      <FriendChatPanel userId={selectedPerson.id} currentUserId={user.id} />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <UpcomingMatches
              matches={upcomingMatchesQuery.data}
              activeSport="all"
              sportsByKey={sportsByKey}
              currentUserId={discoverModalData.currentUserId ?? ''}
              onSeeAll={() => navigate('/matches')}
              onViewDetails={discoverModalData.onViewDetails}
              onCreateMatch={createSessionModalData.openCreateModal}
              onJoinMatch={discoverModalData.openDiscoverModal}
              onParticipationAction={railParticipationAction.onParticipationAction}
              isParticipationActionPending={railParticipationAction.isParticipationActionPending}
            />
            <TrendingHashtags
              hashtags={hashtagsQuery.data}
              onHashtagClick={noop}
              isLoading={hashtagsQuery.isLoading}
              isError={hashtagsQuery.isError}
              onRetry={hashtagsQuery.refetch}
            />
            <GroupBroadcasts
              broadcasts={broadcastsQuery.data}
              onBroadcastClick={noop}
              isLoading={broadcastsQuery.isLoading}
              isError={broadcastsQuery.isError}
              onRetry={broadcastsQuery.refetch}
            />
          </div>
        </div>
        <CreateSessionModal
          key={createSessionModalData.isCreateModalOpen ? 'open' : 'closed'}
          isOpen={createSessionModalData.isCreateModalOpen}
          onClose={closeCreateSessionModal}
          sportsByKey={sportsByKey}
          selectedLocation={createSessionModalData.selectedLocationForCreate}
          onOpenLocationPicker={createSessionModalData.onOpenLocationPickerForCreate}
          locationPicker={createSessionModalData.locationPickerForCreate}
          friends={createSessionModalData.friends}
          isFriendsLoading={createSessionModalData.isFriendsLoading}
          onEffectiveSportChange={createSessionModalData.onEffectiveSportChangeForCreate}
          favoriteLocations={createSessionModalData.favoriteLocationsForCreate}
          isFavoriteLocationsLoading={createSessionModalData.isFavoriteLocationsLoading}
          onSelectLocation={createSessionModalData.onSelectLocationForCreate}
          onSubmit={createSessionModalData.submitCreate}
          isSubmitting={createSessionModalData.isCreating}
          isError={createSessionModalData.isCreateError}
          availableSports={availableSports}
          onAddSport={addSportMutation.mutate}
          isAddingSport={addSportMutation.isPending}
          isAddSportError={addSportMutation.isError}
        />
        <SessionDiscoverModal
          isOpen={discoverModalData.isDiscoverModalOpen}
          onClose={closeDiscoverModal}
          searchMode={discoverModalData.searchMode}
          onSearchModeChange={discoverModalData.setSearchMode}
          searchText={discoverModalData.searchText}
          onSearchTextChange={discoverModalData.setSearchText}
          sessions={discoverModalData.discoverSessions}
          isLoading={discoverModalData.isDiscoverLoading}
          isError={discoverModalData.isDiscoverError}
          sportsByKey={sportsByKey}
          currentUserId={discoverModalData.currentUserId ?? ''}
          onViewDetails={discoverModalData.onViewDetails}
          onParticipationAction={discoverModalData.onParticipationAction}
          isParticipationActionPending={discoverModalData.isParticipationActionPending}
          availableSports={availableSports}
          onAddSport={addSportMutation.mutate}
          isAddingSport={addSportMutation.isPending}
          isAddSportError={addSportMutation.isError}
        />
        <SessionDetailModal
          isOpen={discoverModalData.selectedSessionId !== null}
          onClose={discoverModalData.closeDetail}
          session={discoverModalData.selectedSession}
          sportsByKey={sportsByKey}
          isLoading={discoverModalData.isSessionLoading}
          isError={discoverModalData.isSessionError}
          participants={discoverModalData.participants}
          isParticipantsLoading={discoverModalData.isParticipantsLoading}
          isParticipantsError={discoverModalData.isParticipantsError}
          currentUserId={discoverModalData.currentUserId}
          canManage={discoverModalData.canManage}
          onJoin={discoverModalData.onJoin}
          isJoining={discoverModalData.isJoining}
          isJoinError={discoverModalData.isJoinError}
          onLeave={discoverModalData.onLeave}
          isLeaving={discoverModalData.isLeaving}
          isLeaveError={discoverModalData.isLeaveError}
          onConfirmCancel={discoverModalData.onConfirmCancel}
          isCancelling={discoverModalData.isCancelling}
          isCancelError={discoverModalData.isCancelError}
          requestedParticipants={discoverModalData.requestedParticipants}
          isRequestedParticipantsLoading={discoverModalData.isRequestedParticipantsLoading}
          isRequestedParticipantsError={discoverModalData.isRequestedParticipantsError}
          onApproveParticipant={discoverModalData.onApproveParticipant}
          isApprovingParticipant={discoverModalData.isApprovingParticipant}
          onRejectParticipant={discoverModalData.onRejectParticipant}
          isRejectingParticipant={discoverModalData.isRejectingParticipant}
          onToggleLike={discoverModalData.onToggleLike}
          isTogglingLike={discoverModalData.isTogglingLike}
          currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
          comments={discoverModalData.comments}
          isCommentsLoading={discoverModalData.isCommentsLoading}
          isCommentsError={discoverModalData.isCommentsError}
          isCommentsForbidden={discoverModalData.isCommentsForbidden}
          hasMoreComments={discoverModalData.hasMoreComments}
          isFetchingMoreComments={discoverModalData.isFetchingMoreComments}
          onFetchMoreComments={discoverModalData.onFetchMoreComments}
          onAddComment={discoverModalData.onAddComment}
          onAddCommentReply={discoverModalData.onAddCommentReply}
          isPostingComment={discoverModalData.isPostingComment}
          onDeleteComment={discoverModalData.onDeleteComment}
          onToggleCommentLike={discoverModalData.onToggleCommentLike}
        />
        <FriendRequestUnavailableDialog isOpen={data.focusUnavailable} onClose={clearFocusState} />
      </main>
    </ModalAnchorProvider>
  );
}
