import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import { CreateSessionModal } from '@/features/session/components/CreateSessionModal';
import { SessionDetailModal } from '@/features/session/components/SessionDetailModal';
import { SessionDiscoverModal } from '@/features/session/components/SessionDiscoverModal';
import { useSessionParticipationAction } from '@/features/session/hooks/useSessionParticipationAction';
import { useCreateSessionModalData } from '@/features/session/useCreateSessionModalData';
import { useDiscoverModalData } from '@/features/session/useDiscoverModalData';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { EditProfileModal } from '@/shared/components/EditProfileModal';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { NoSportsToAddDialog } from '@/shared/components/NoSportsToAddDialog';
import { ProfileHeader } from '@/shared/components/ProfileHeader';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { useAddSportLauncher } from '@/shared/hooks/useAddSportLauncher';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import { useAnchorBottom, ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { MemoriesTab } from './components/MemoriesTab';
import { PostsTab } from './components/PostsTab';
import { ProfileTabs, type ProfileTabKey } from './components/ProfileTabs';
import { SportProfileSettingsTab } from './components/SportProfileSettingsTab';
import { useMyProfile } from './useMyProfile';
import { useProfileActiveSport } from './useProfileActiveSport';
import { useUpdateMyProfile } from './useUpdateMyProfile';

/**
 * Assembles the `/profile` page (PROFILE-6): `SportSwitcher` (no `'all'` pill,
 * PROFILE-4's page-wide decision) above `ProfileHeader`, then a two-column
 * grid — `ProfileTabs`' vertical rail + the active tab's content on the left,
 * the shared right rail (Upcoming/Trending/Broadcasts, same page-agnostic
 * hooks and components every other page mounts) on the right. `PostsTab`,
 * `MemoriesTab`, and `SportProfileSettingsTab` are all self-contained (their
 * own PROFILE-2/3/4 tickets already gave them their own data hooks) — this
 * page only decides which one is showing.
 *
 * `activeTab` is page-local (no deep link for it, unlike Home Feed's
 * FEED-12 comment dialog) — same scope `GroupTabs`' `activeGroupTab` has on
 * the Groups page.
 *
 * The right rail's `UpcomingMatches` needs a real `onCreateMatch`/
 * `onJoinMatch`/`onParticipationAction` (CLIENT-SESSION-7/9) — this page
 * wires the same `CreateSessionModal`/`SessionDiscoverModal`/
 * `SessionDetailModal` stack every other rail-hosting page
 * (Home Feed/Groups/Friends) already does, not a stub.
 */
export function ProfilePage() {
  const navigate = useNavigate();
  // ProfilePage renders behind ProtectedRoute (AUTH-4), so user is guaranteed
  // non-null here — same guarantee every other page relies on.
  const user = useAuthStore((state) => state.user)!;
  const setStoredActiveSport = useProfilePageStore((state) => state.setActiveSport);
  const { activeSport } = useProfileActiveSport();

  const [activeTab, setActiveTab] = useState<ProfileTabKey>('posts');
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileOpenCount, setEditProfileOpenCount] = useState(0);
  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  const [addSportOpenCount, setAddSportOpenCount] = useState(0);

  const profileQuery = useMyProfile();
  const updateProfile = useUpdateMyProfile();

  const sportProfilesQuery = useSportProfiles();
  const sportCatalog = useSportCatalog();
  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
  );
  const availableSports = useMemo(
    () =>
      sportCatalog.data
        .map((sport) => sport.key)
        .filter((key) => !sportProfilesQuery.data.some((sport) => sport.key === key)),
    [sportCatalog.data, sportProfilesQuery.data],
  );

  const addSportMutation = useAddSportProfile(user.id);
  const addSportLauncher = useAddSportLauncher({
    heldSportKeys: sportProfilesQuery.data.map((sport) => sport.key),
    onOpenPicker: () => {
      setAddSportOpenCount((count) => count + 1);
      setIsAddSportOpen(true);
    },
  });

  const upcomingMatchesQuery = useUpcomingMatches();
  const hashtagsQuery = useTrendingHashtags();
  const broadcastsQuery = useGroupBroadcasts();

  const createSessionModalData = useCreateSessionModalData();
  const activeSportId = activeSport !== undefined ? sportIdForKey(activeSport) : undefined;
  const discoverModalData = useDiscoverModalData(activeSportId);
  const railParticipationAction = useSessionParticipationAction();

  // CLIENT-MODAL-1: both modals embed the zero-sport-profile gate, which renders
  // `addSportMutation.isError` — so their close has to clear it too, not just
  // AddSportModal's. Each hook's own close already resets the mutation it owns.
  const closeCreateSessionModal = () => {
    addSportMutation.reset();
    createSessionModalData.closeCreateModal();
  };
  const closeDiscoverModal = () => {
    addSportMutation.reset();
    discoverModalData.closeDiscoverModal();
  };

  const sportSwitcherRef = useRef<HTMLDivElement>(null);
  const modalAnchorBottom = useAnchorBottom(sportSwitcherRef);

  return (
    <ModalAnchorProvider value={modalAnchorBottom}>
      <main className="py-4">
        <h1 className="sr-only">Profile</h1>
        <div className="mb-4" ref={sportSwitcherRef}>
          <SportSwitcher
            sports={sportProfilesQuery.data}
            active={activeSport ?? 'all'}
            onChange={(key) => {
              if (key !== 'all') setStoredActiveSport(key);
            }}
            maxSports={sportCatalog.data.length || undefined}
            isCheckingCatalog={addSportLauncher.isCheckingCatalog}
            onAddSport={addSportLauncher.launch}
            showAllPill={false}
          />
        </div>
        {profileQuery.data !== undefined && (
          <ProfileHeader
            user={profileQuery.data}
            onEditProfile={() => {
              setEditProfileOpenCount((count) => count + 1);
              setIsEditProfileOpen(true);
            }}
          />
        )}
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[2.1fr_0.9fr]">
          <div className="min-w-0">
            <div className="border-hairline flex gap-3.5 rounded-xl border-border bg-surface-2 p-3.5">
              <ProfileTabs activeTab={activeTab} onChange={setActiveTab} />
              <div className="min-w-0 flex-1">
                {activeTab === 'posts' && <PostsTab />}
                {activeTab === 'memories' && <MemoriesTab />}
                {activeTab === 'settings' && <SportProfileSettingsTab />}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3.5">
            <UpcomingMatches
              matches={upcomingMatchesQuery.data}
              activeSport={activeSport ?? 'all'}
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
              onHashtagClick={() => {}}
              isLoading={hashtagsQuery.isLoading}
              isError={hashtagsQuery.isError}
              onRetry={hashtagsQuery.refetch}
            />
            <GroupBroadcasts
              broadcasts={broadcastsQuery.data}
              onBroadcastClick={() => {}}
              isLoading={broadcastsQuery.isLoading}
              isError={broadcastsQuery.isError}
              onRetry={broadcastsQuery.refetch}
            />
          </div>
        </div>
        {profileQuery.data !== undefined && (
          <EditProfileModal
            key={editProfileOpenCount}
            isOpen={isEditProfileOpen}
            onClose={() => {
              updateProfile.reset();
              setIsEditProfileOpen(false);
            }}
            user={profileQuery.data}
            onSave={(payload) =>
              updateProfile.updateProfile(payload, { onSuccess: () => setIsEditProfileOpen(false) })
            }
            isSaving={updateProfile.isPending}
            errorMessage={updateProfile.errorMessage}
          />
        )}
        <NoSportsToAddDialog
          isOpen={addSportLauncher.isDialogOpen}
          onClose={addSportLauncher.closeDialog}
          isCatalogUnavailable={addSportLauncher.isCatalogUnavailable}
          onRetry={addSportLauncher.retry}
          isRetrying={addSportLauncher.isCheckingCatalog}
        />
        <AddSportModal
          key={addSportOpenCount}
          isOpen={isAddSportOpen}
          onClose={() => {
            addSportMutation.reset();
            setIsAddSportOpen(false);
          }}
          availableSports={availableSports}
          isSubmitting={addSportMutation.isPending}
          isError={addSportMutation.isError}
          onSubmit={(payload) =>
            addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
          }
        />
        <CreateSessionModal
          key={createSessionModalData.isCreateModalOpen ? 'open' : 'closed'}
          isOpen={createSessionModalData.isCreateModalOpen}
          onClose={closeCreateSessionModal}
          sportsByKey={sportsByKey}
          activeSport={activeSport ?? 'all'}
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
      </main>
    </ModalAnchorProvider>
  );
}
