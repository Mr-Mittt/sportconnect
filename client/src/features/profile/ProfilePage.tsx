import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import { sportIdForKey, sportKeyForId } from '@/features/feed/sportIdMap';
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
import { useResumableSports } from '@/shared/hooks/useResumableSports';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUnsavedChangesGuard } from '@/shared/hooks/useUnsavedChangesGuard';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import { useAnchorBottom, ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import { PAGE_ACCESS_NO_SPORTS_PROMPT } from '@/shared/lib/noSportsPrompt';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { MemoriesTab } from './components/MemoriesTab';
import { PostsTab } from './components/PostsTab';
import { ProfileTabs, type ProfileTabKey } from './components/ProfileTabs';
import { SettingsUnsavedChangesDialog } from './components/SettingsUnsavedChangesDialog';
import { SportProfileSettingsTab } from './components/SportProfileSettingsTab';
import { SportProfileStatusConfirmDialog } from './components/SportProfileStatusConfirmDialog';
import { useDeactivateSportProfile } from './useDeactivateSportProfile';
import { useMyProfile } from './useMyProfile';
import { useProfileActiveSport } from './useProfileActiveSport';
import { useSportProfileSettingsTabData } from './useSportProfileSettingsTabData';
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
 *
 * Zero-sport-profile gate on page access, same as `GroupsPage`/`MatchesPage`
 * (not Home Feed/Friends, which don't need one — their content still makes
 * sense with no sport profile): a caller who lands here with none gets the
 * same `AddSportModal` the SportSwitcher's own "+" pill opens, prompted
 * automatically once (`hasAutoPromptedAddSportRef` latches after the first
 * prompt, not re-shown just because it's closed), with the same
 * `PAGE_ACCESS_NO_SPORTS_PROMPT` copy Groups/Matches use. Fitting: this
 * page's Settings tab is the one place that's genuinely unusable with zero
 * sport profiles (`SportProfileSettingsTab` already renders "Add a sport
 * above to set up its profile.").
 *
 * PROFILE-10: this page now owns `useSportProfileSettingsTabData()` directly
 * (`SportProfileSettingsTab` is controlled, not self-contained — see that
 * component's own doc comment) and wraps `ProfileTabs`' `onChange` and
 * `SportSwitcher`'s `onChange` in `useUnsavedChangesGuard(settingsTab.isDirty)`'s
 * `guard()` — leaving the Settings tab with unsaved edits, by any of those
 * two in-page actions, or by an in-app navigation away from `/profile`,
 * prompts `SettingsUnsavedChangesDialog` first (Discard/Save), same
 * three-leave-points shape `GroupsPage`'s own Settings guard already
 * established. Calling this hook unconditionally (not gated to when Settings
 * is the active tab, unlike `GroupsPage`'s settings queries) means its
 * `useSportAttributeSchema` fetch now runs on every `/profile` visit, not
 * just a Settings visit — a small, deliberate eagerness trade-off: the guard
 * needs to know `isDirty` before the user has necessarily ever opened
 * Settings this session, and the request itself is cheap and cached.
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
  // SPORT-10: which sport the Settings tab edits, when it isn't the page's active sport — set
  // by clicking a *deactivated* `SportSwitcher` pill (which also switches to the Settings tab).
  // Cleared whenever an active pill is picked, so the tab follows the active sport again.
  const [settingsSportOverride, setSettingsSportOverride] = useState<SportKey | undefined>(undefined);
  // SPORT-10: the Active toggle's confirm dialog. `null` = closed.
  const [statusToggle, setStatusToggle] = useState<{
    mode: 'deactivate' | 'reactivate';
    sportId: number;
    profileId: number;
    sportName: string;
  } | null>(null);

  const profileQuery = useMyProfile();
  const updateProfile = useUpdateMyProfile();
  const settingsTabData = useSportProfileSettingsTabData(settingsSportOverride);
  const settingsGuard = useUnsavedChangesGuard(settingsTabData.isDirty);
  const deactivateSportProfile = useDeactivateSportProfile();

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
  const { resumableProfiles, inactiveSports } = useResumableSports();
  const [addSportPromptMessage, setAddSportPromptMessage] = useState<string | undefined>(undefined);
  const addSportLauncher = useAddSportLauncher({
    heldSportKeys: sportProfilesQuery.data.map((sport) => sport.key),
    onOpenPicker: () => {
      setAddSportPromptMessage(undefined);
      setAddSportOpenCount((count) => count + 1);
      setIsAddSportOpen(true);
    },
  });

  // Zero-sport-profile gate on page access — see the top-level doc comment.
  const hasAutoPromptedAddSportRef = useRef(false);
  useEffect(() => {
    if (
      hasAutoPromptedAddSportRef.current ||
      sportProfilesQuery.isLoading ||
      sportProfilesQuery.data.length > 0
    ) {
      return;
    }
    hasAutoPromptedAddSportRef.current = true;
    setAddSportPromptMessage(PAGE_ACCESS_NO_SPORTS_PROMPT);
    setAddSportOpenCount((count) => count + 1);
    setIsAddSportOpen(true);
  }, [sportProfilesQuery.isLoading, sportProfilesQuery.data.length]);

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
            onChange={(key) =>
              settingsGuard.guard(() => {
                // SPORT-10: back to following the active sport for the Settings tab.
                setSettingsSportOverride(undefined);
                if (key !== 'all') setStoredActiveSport(key);
              })
            }
            maxSports={sportCatalog.data.length || undefined}
            isCheckingCatalog={addSportLauncher.isCheckingCatalog}
            onAddSport={addSportLauncher.launch}
            showAllPill={false}
            inactiveSports={inactiveSports}
            onInactiveSelect={(key) =>
              // SPORT-10: a deactivated pill opens the Settings tab for that sport (toggle set to
              // Inactive, everything below read-only) — not AddSportModal.
              settingsGuard.guard(() => {
                setSettingsSportOverride(key);
                setActiveTab('settings');
              })
            }
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
              <ProfileTabs
                activeTab={activeTab}
                onChange={(tab) => settingsGuard.guard(() => setActiveTab(tab))}
              />
              <div className="min-w-0 flex-1">
                {activeTab === 'posts' && <PostsTab />}
                {activeTab === 'memories' && <MemoriesTab />}
                {activeTab === 'settings' && (
                  <SportProfileSettingsTab
                    activeProfile={settingsTabData.activeProfile}
                    isLoading={settingsTabData.isLoading}
                    schema={settingsTabData.schema}
                    draft={settingsTabData.draft}
                    setSkillLevel={settingsTabData.setSkillLevel}
                    setYearsOfExperience={settingsTabData.setYearsOfExperience}
                    setPreferredPosition={settingsTabData.setPreferredPosition}
                    setAttribute={settingsTabData.setAttribute}
                    isDirty={settingsTabData.isDirty}
                    onSave={() => settingsTabData.save()}
                    isSaving={settingsTabData.isSaving}
                    errorMessage={settingsTabData.errorMessage}
                    onToggleActive={() => {
                      const profile = settingsTabData.activeProfile;
                      if (profile === undefined) return;
                      deactivateSportProfile.reset();
                      addSportMutation.reset();
                      // Pin the Settings tab to this sport across the active/inactive flip so it
                      // doesn't jump to another sport once this one leaves (or rejoins) the active
                      // list.
                      const key = sportKeyForId(profile.sportId);
                      if (key !== undefined) setSettingsSportOverride(key);
                      setStatusToggle({
                        mode: profile.isActive ? 'deactivate' : 'reactivate',
                        sportId: profile.sportId,
                        profileId: profile.id,
                        sportName: profile.sportName,
                      });
                    }}
                    isTogglingActive={
                      deactivateSportProfile.isPending || addSportMutation.isPending
                    }
                  />
                )}
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
            key={`edit-profile-${editProfileOpenCount}`}
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
        <SettingsUnsavedChangesDialog
          isOpen={settingsGuard.isLeaveDialogOpen}
          onCancel={settingsGuard.cancelLeave}
          onDiscard={() => {
            settingsTabData.discard();
            settingsGuard.proceed();
          }}
          onSave={() => settingsTabData.save({ onSuccess: settingsGuard.proceed })}
          isSaving={settingsTabData.isSaving}
          isSaveError={settingsTabData.errorMessage !== null}
        />
        <NoSportsToAddDialog
          isOpen={addSportLauncher.isDialogOpen}
          onClose={addSportLauncher.closeDialog}
          isCatalogUnavailable={addSportLauncher.isCatalogUnavailable}
          onRetry={addSportLauncher.retry}
          isRetrying={addSportLauncher.isCheckingCatalog}
        />
        <AddSportModal
          key={`add-sport-${addSportOpenCount}`}
          isOpen={isAddSportOpen}
          onClose={() => {
            addSportMutation.reset();
            setIsAddSportOpen(false);
          }}
          availableSports={availableSports}
          resumableProfiles={resumableProfiles}
          isSubmitting={addSportMutation.isPending}
          isError={addSportMutation.isError}
          onSubmit={(payload) =>
            addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
          }
          promptMessage={addSportPromptMessage}
        />
        <SportProfileStatusConfirmDialog
          key={statusToggle ? `${statusToggle.mode}-${statusToggle.profileId}` : 'closed'}
          isOpen={statusToggle !== null}
          mode={statusToggle?.mode ?? 'deactivate'}
          sportName={statusToggle?.sportName ?? ''}
          onClose={() => {
            deactivateSportProfile.reset();
            addSportMutation.reset();
            setStatusToggle(null);
          }}
          onConfirm={() => {
            if (statusToggle === null) return;
            if (statusToggle.mode === 'deactivate') {
              deactivateSportProfile.deactivateSportProfile(statusToggle.profileId, {
                onSuccess: () => setStatusToggle(null),
              });
            } else {
              addSportMutation.mutate(
                { sportId: statusToggle.sportId, isResume: true },
                { onSuccess: () => setStatusToggle(null) },
              );
            }
          }}
          isSubmitting={deactivateSportProfile.isPending || addSportMutation.isPending}
          isError={
            statusToggle?.mode === 'deactivate'
              ? deactivateSportProfile.isError
              : addSportMutation.isError
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
          resumableProfiles={resumableProfiles}
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
          resumableProfiles={resumableProfiles}
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
