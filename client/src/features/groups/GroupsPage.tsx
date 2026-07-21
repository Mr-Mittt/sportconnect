import { useMemo, useState } from 'react';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { useCreateGroup } from '@/features/feed/hooks/useCreateGroup';
import { useDeleteGroup } from '@/features/feed/hooks/useDeleteGroup';
import { useLeaveGroup } from '@/features/feed/hooks/useLeaveGroup';
import { usePost } from '@/features/feed/hooks/usePost';
import { useUpdateGroup } from '@/features/feed/hooks/useUpdateGroup';
import { SPORT_ID_BY_KEY, sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { useHashtagResultsData } from '@/features/feed/useHashtagResultsData';
import { AddSportModal } from '@/shared/components/AddSportModal';
import { CommentSection } from '@/shared/components/CommentSection';
import { CreatePostForm } from '@/shared/components/CreatePostForm';
import { Feed } from '@/shared/components/Feed';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { HashtagPostsModal } from '@/shared/components/HashtagPostsModal';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { UpdateBroadcastConfirmDialog } from '@/shared/components/UpdateBroadcastConfirmDialog';
import { useAddSportProfile } from '@/shared/hooks/useAddSportProfile';
import { ALL_SPORT_KEYS } from '@/shared/lib/sportProfileConfig';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './components/CreateGroupModal';
import { DeleteGroupConfirmDialog } from './components/DeleteGroupConfirmDialog';
import { GroupChatTab } from './components/GroupChatTab';
import { GroupCoverBanner } from './components/GroupCoverBanner';
import { GroupDiscoveryPanel } from './components/GroupDiscoveryPanel';
import { GroupMembersTab } from './components/GroupMembersTab';
import { GroupSettingsTab } from './components/GroupSettingsTab';
import { GroupSpaceSwitcher } from './components/GroupSpaceSwitcher';
import { GroupTabs, type GroupTabKey } from './components/GroupTabs';
import { InviteFriendModal } from './components/InviteFriendModal';
import { JoinGroupModal } from './components/JoinGroupModal';
import { SettingsUnsavedChangesDialog } from './components/SettingsUnsavedChangesDialog';
import { useGroupMembersTabData } from './useGroupMembersTabData';
import { useGroupsPageData } from './useGroupsPageData';
import { useJoinGroupModalData } from './useJoinGroupModalData';
import { useSettingsUnsavedGuard } from './useSettingsUnsavedGuard';

// Callback-only entry points with no destination yet — same "affordance
// exists, destination doesn't yet" pattern as HF-3/HF-4/HF-7's other no-ops.
// Hashtag click-through is real now (FEED-6, via HashtagPostsModal).
const noop = () => {};

/**
 * Groups page (FEED-4, rail + create/join FEED-5) — the actual home of
 * "which space am I looking at": personal-vs-group switching that the
 * ticket's spec describes lives here, not inline on Home Feed (user
 * decision). Reached via NavTabs' existing "Groups" destination (previously
 * a ComingSoonPage stub).
 *
 * activeSport is read from the shared `feedSpaceStore`, so it's carried over
 * from whatever was active on Home Feed (user decision) and remains
 * switchable from here too — one source of truth either page can change.
 * GroupSpaceSwitcher's group list is filtered to that sport (a group is 1:1
 * with a sport, so this is exact). CreatePostForm only renders when a
 * specific group is selected — "All" has no single group to post into.
 *
 * The right rail (UpcomingMatches → TrendingHashtags → GroupBroadcasts, FEED-5
 * user decision) is identical to Home Feed's — same shared components and
 * hooks, not a group-scoped variant. Hashtags (FEED-6) and broadcasts
 * (FEED-7) are real now; upcomingMatches stays mock (no matches backend).
 *
 * Hashtag click-through opens `HashtagPostsModal` via page-local
 * `activeHashtag` state, same pattern as `HomeFeedPage` — clicking a post's
 * comment icon while it's open closes it first and opens `CommentSection`.
 *
 * FEED-7: `CreatePostForm`'s "Broadcast" toggle only appears when
 * `canBroadcast` (the selected group's owner/admin). Submitting with it on
 * either creates a new `GROUP_BROADCAST` post, or — if the group already has
 * one active (the backend caps at one per group) — opens
 * `UpdateBroadcastConfirmDialog` instead of letting the create call 400;
 * confirming updates the existing broadcast's content in place (user
 * decision). `pendingBroadcastContent !== null` doubles as that dialog's
 * open state, same `activeCommentsPostId`-style convention already used here.
 */
export function GroupsPage() {
  const activeSport = useFeedSpaceStore((state) => state.activeSport);
  const setActiveSport = useFeedSpaceStore((state) => state.setActiveSport);
  // FEED-12: page-local only, unlike HomeFeedPage's URL-driven version —
  // navigating away to `/posts/:id` would unmount this page (and its
  // selected-group state) since that route renders HomeFeedPage, not this
  // one. Still benefits from usePost below (avoids the fragile feed-cache
  // lookup this used to do), just without the URL/deep-link piece.
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  // Which hashtag's results modal is open — same page-local UI-state
  // reasoning as activeCommentsPostId (FEED-6). Split into two pieces
  // deliberately: `activeHashtag` also drives useHashtagResultsData's query
  // and must stay set (so its cached posts survive) even while the modal is
  // visually hidden mid-transition to CommentSection — only `isHashtagModalOpen`
  // controls the Dialog's actual visibility. Clearing `activeHashtag` too
  // (i.e. tearing down the query) at the same time as opening comments would
  // make usePost's own findPostInFeedCaches initialData seed (which scans
  // this same query) see an empty list in that same render (a real bug this
  // shape avoids).
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [isHashtagModalOpen, setIsHashtagModalOpen] = useState(false);
  // Holds the composer's content while UpdateBroadcastConfirmDialog is open
  // (the group already has an active broadcast) — null both before and
  // after (doubles as the dialog's isOpen), same convention as
  // activeCommentsPostId (FEED-7).
  const [pendingBroadcastContent, setPendingBroadcastContent] = useState<string | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  // GRP-1: whatever was typed into GroupDiscoveryPanel's shared input when
  // "Create Group" was clicked — pre-fills CreateGroupModal's name field.
  const [pendingCreateGroupName, setPendingCreateGroupName] = useState('');
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  const [isAddSportOpen, setIsAddSportOpen] = useState(false);
  // GRP-3: Members tab's "Invite friend" — same pre-fill/remount pattern as
  // pendingCreateGroupName/createGroupOpenCount above.
  const [isInviteFriendOpen, setIsInviteFriendOpen] = useState(false);
  const [inviteFriendQuery, setInviteFriendQuery] = useState('');
  const [inviteFriendOpenCount, setInviteFriendOpenCount] = useState(0);
  // GRP-1: which of the per-group tabs is showing. Reset to 'posts' at every
  // point that changes `selectedGroupId` (see `selectGroupAndShowPosts`
  // below) rather than via an effect, per React's own guidance to avoid
  // synchronous setState-in-effect.
  const [activeGroupTab, setActiveGroupTab] = useState<GroupTabKey>('posts');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // Bumped on every open (not close) — remounts CreateGroupModal/AddSportModal
  // so their internal form field state starts fresh each time, without an
  // effect calling setState. JoinGroupModal doesn't need this — its search
  // state lives in useJoinGroupModalData below, not in the component itself.
  const [createGroupOpenCount, setCreateGroupOpenCount] = useState(0);
  const [addSportOpenCount, setAddSportOpenCount] = useState(0);
  // GroupsPage renders behind ProtectedRoute (AUTH-4), so user is guaranteed
  // non-null here — same guarantee HomeFeedPage already relies on.
  const user = useAuthStore((state) => state.user)!;
  const {
    data,
    selectedGroupId,
    selectGroup,
    isLoading,
    isError,
    toggleLike,
    toggleLikeForPost,
    deletePost,
    createPost,
    isCreatingPost,
    isCreatePostError,
    canBroadcast,
    activeBroadcastForSelectedGroup,
    updateBroadcast,
    isUpdatingBroadcast,
    isBroadcastUpdateError,
    currentUserId,
    hasMorePosts,
    isFetchingMorePosts,
    fetchMorePosts,
    isLoadMorePostsError,
    retryPosts,
    isHashtagsLoading,
    isHashtagsError,
    retryHashtags,
    isBroadcastsLoading,
    isBroadcastsError,
    retryBroadcasts,
    isGroupsLoading,
    isGroupsError,
    retryGroups,
  } = useGroupsPageData();
  // GRP-1: every place that changes which group is selected also resets the
  // per-group tab back to Posts — a stale Settings/Chat selection from a
  // previously viewed group would be confusing to land on.
  const selectGroupAndShowPosts = (groupId: number | null, groupSportId?: number | null) => {
    selectGroup(groupId, groupSportId ?? undefined);
    setActiveGroupTab('posts');
  };
  // GRP-2: unsaved GroupSettings-toggle draft, Save, and the leave-guard
  // (tab/group switch here; in-app nav + browser close/refresh inside the
  // hook itself). `guard()` below wraps every action that would navigate
  // away from the currently viewed Settings tab.
  const settingsGuard = useSettingsUnsavedGuard(
    selectedGroupId ?? undefined,
    activeGroupTab === 'settings',
    currentUserId,
  );
  const guardedSetActiveGroupTab = (tab: GroupTabKey) => settingsGuard.guard(() => setActiveGroupTab(tab));
  const guardedSelectGroupAndShowPosts = (groupId: number | null, groupSportId?: number | null) =>
    settingsGuard.guard(() => selectGroupAndShowPosts(groupId, groupSportId));
  const commentsData = useCommentsData(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const activeCommentsPostQuery = usePost(activeCommentsPostId ?? -1, activeCommentsPostId !== null);
  const hashtagResultsData = useHashtagResultsData(activeHashtag, activeHashtag !== null);
  const createGroupMutation = useCreateGroup(currentUserId);
  const addSportMutation = useAddSportProfile(currentUserId);
  const lockedSport = activeSport !== 'all' ? activeSport : null;
  const joinGroupModalData = useJoinGroupModalData(
    currentUserId,
    lockedSport !== null ? SPORT_ID_BY_KEY[lockedSport] : undefined,
    isJoinGroupOpen,
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(data.sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [data.sportProfiles],
  );
  const availableSports = useMemo(
    () => ALL_SPORT_KEYS.filter((key) => !data.sportProfiles.some((sport) => sport.key === key)),
    [data.sportProfiles],
  );

  // GRP-1: the full selected Group (cover banner, Settings tab) — found in
  // `data.groups`, which is sport-filtered but always contains the
  // selection, since `feedSpaceStore` only ever lets a selected group's
  // sport and `activeSport` diverge instantaneously, never settle mismatched.
  const selectedGroup = data.groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedGroupSportKey = selectedGroup !== null ? sportKeyForId(selectedGroup.sportId) : undefined;
  const selectedGroupSport =
    selectedGroupSportKey !== undefined ? sportsByKey[selectedGroupSportKey] : undefined;

  // GRP-3
  const membersTabData = useGroupMembersTabData(
    selectedGroup?.id,
    activeGroupTab === 'members',
    selectedGroup?.currentUserRole ?? null,
  );

  const updateGroupMutation = useUpdateGroup(currentUserId);
  const leaveGroupMutation = useLeaveGroup(currentUserId);
  const deleteGroupMutation = useDeleteGroup(currentUserId);

  const handleUpdatePrivacy = (isPrivate: boolean) => {
    if (selectedGroupId === null) return;
    updateGroupMutation.mutate({ groupId: selectedGroupId, payload: { isPrivate } });
  };
  const handleLeaveGroup = () => {
    if (selectedGroupId === null) return;
    leaveGroupMutation.mutate(selectedGroupId);
  };
  const handleConfirmDeleteGroup = () => {
    if (selectedGroupId === null) return;
    deleteGroupMutation.mutate(selectedGroupId, { onSuccess: () => setIsDeleteConfirmOpen(false) });
  };
  const openCreateGroup = (name: string = '') => {
    setPendingCreateGroupName(name);
    setCreateGroupOpenCount((count) => count + 1);
    setIsCreateGroupOpen(true);
  };
  // GRP-1: opening JoinGroupModal from GroupDiscoveryPanel's shared input —
  // pre-fills and, if non-empty, kicks off a search immediately rather than
  // requiring a second "Search" click.
  const openJoinGroupWithQuery = (query: string) => {
    joinGroupModalData.openSearch(query);
    setIsJoinGroupOpen(true);
  };
  // GRP-3: opening InviteFriendModal from GroupMembersTab's "find member"
  // input — same pre-fill reasoning as openJoinGroupWithQuery above.
  const openInviteFriend = (query: string) => {
    setInviteFriendQuery(query);
    setInviteFriendOpenCount((count) => count + 1);
    setIsInviteFriendOpen(true);
  };

  // FEED-12: comes from usePost, not a feed-cache lookup — see
  // HomeFeedPage's own equivalent comment for the full reasoning.
  const activeCommentsPost = activeCommentsPostQuery.data ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined ? (sportsByKey[activeCommentsPostSportKey] ?? null) : null;

  // Broadcasting into a group that already has one active would 400 —
  // detect it client-side and open the confirm-update dialog instead of
  // calling create (FEED-7 user decision).
  const handleSubmitPost = (content: string, options: { asBroadcast: boolean }) => {
    if (options.asBroadcast && activeBroadcastForSelectedGroup !== null) {
      setPendingBroadcastContent(content);
      return;
    }
    createPost(content, options);
  };

  const confirmUpdateBroadcast = () => {
    if (pendingBroadcastContent === null) return;
    updateBroadcast(pendingBroadcastContent, { onSuccess: () => setPendingBroadcastContent(null) });
  };

  return (
    <main className="py-4">
      <h1 className="sr-only">Groups</h1>
      <div className="mb-3">
        <SportSwitcher
          sports={data.sportProfiles}
          active={activeSport}
          onChange={setActiveSport}
          onAddSport={() => {
            setAddSportOpenCount((count) => count + 1);
            setIsAddSportOpen(true);
          }}
        />
      </div>
      <div className="mb-4">
        <GroupSpaceSwitcher
          groups={data.groups}
          selectedGroupId={selectedGroupId}
          onSelect={guardedSelectGroupAndShowPosts}
          sportsByKey={sportsByKey}
          isLoading={isGroupsLoading}
          isError={isGroupsError}
          onRetry={retryGroups}
        />
      </div>
      {selectedGroup !== null && (
        <GroupCoverBanner
          group={selectedGroup}
          sport={selectedGroupSport}
          onBack={() => guardedSelectGroupAndShowPosts(null)}
        />
      )}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[2.1fr_0.9fr]">
        <div className="min-w-0">
          {selectedGroup === null ? (
            <GroupDiscoveryPanel
              groups={data.groups}
              sportsByKey={sportsByKey}
              onOpenGroup={guardedSelectGroupAndShowPosts}
              onCreateGroup={openCreateGroup}
              onJoinGroup={openJoinGroupWithQuery}
              isLoading={isGroupsLoading}
              isError={isGroupsError}
              onRetry={retryGroups}
            />
          ) : (
            <div className="border-hairline flex gap-3.5 rounded-xl border-border bg-surface-2 p-3.5">
              <GroupTabs activeTab={activeGroupTab} onChange={guardedSetActiveGroupTab} />
              <div className="min-w-0 flex-1">
                {activeGroupTab === 'posts' && (
                  <div className="flex flex-col gap-3.5">
                    <CreatePostForm
                      currentUser={{
                        firstName: user.firstName,
                        fullName: `${user.firstName} ${user.lastName}`,
                        avatarUrl: user.avatarUrl,
                      }}
                      onSubmit={handleSubmitPost}
                      isSubmitting={isCreatingPost}
                      isError={isCreatePostError}
                      onPhotoClick={noop}
                      onLocationClick={noop}
                      onTagSportClick={noop}
                      canBroadcast={canBroadcast}
                    />
                    <Feed
                      posts={data.posts}
                      activeSport={activeSport}
                      sportsByKey={sportsByKey}
                      currentUserId={currentUserId}
                      onToggleLike={toggleLike}
                      onHashtagClick={(tag) => {
                        setActiveHashtag(tag);
                        setIsHashtagModalOpen(true);
                      }}
                      onDeletePost={deletePost}
                      onOpenComments={setActiveCommentsPostId}
                      hasMorePosts={hasMorePosts}
                      isFetchingMorePosts={isFetchingMorePosts}
                      onLoadMore={fetchMorePosts}
                      isLoading={isLoading}
                      isError={isError}
                      showSportBadge={activeSport === 'all'}
                      showGroupName={false}
                      onRetry={retryPosts}
                      isLoadMoreError={isLoadMorePostsError}
                    />
                  </div>
                )}
                {activeGroupTab === 'chat' && (
                  <GroupChatTab key={selectedGroup.id} currentUserFirstName={user.firstName} />
                )}
                {activeGroupTab === 'members' && (
                  <GroupMembersTab
                    canManage={membersTabData.canManage}
                    currentUserId={currentUserId}
                    joinRequests={membersTabData.joinRequests}
                    isJoinRequestsLoading={membersTabData.isJoinRequestsLoading}
                    isJoinRequestsError={membersTabData.isJoinRequestsError}
                    onRetryJoinRequests={membersTabData.retryJoinRequests}
                    onAcceptJoinRequest={membersTabData.acceptJoinRequest}
                    onDeclineJoinRequest={membersTabData.declineJoinRequest}
                    isAcceptingJoinRequest={membersTabData.isAcceptingJoinRequest}
                    isDecliningJoinRequest={membersTabData.isDecliningJoinRequest}
                    sentInvitations={membersTabData.sentInvitations}
                    isSentInvitationsLoading={membersTabData.isSentInvitationsLoading}
                    isSentInvitationsError={membersTabData.isSentInvitationsError}
                    onRetrySentInvitations={membersTabData.retrySentInvitations}
                    administrators={membersTabData.administrators}
                    members={membersTabData.members}
                    isMembersLoading={membersTabData.isMembersLoading}
                    isMembersError={membersTabData.isMembersError}
                    onRetryMembers={membersTabData.retryMembers}
                    onInviteFriend={openInviteFriend}
                  />
                )}
                {activeGroupTab === 'settings' && (
                  <GroupSettingsTab
                    group={selectedGroup}
                    currentUserRole={selectedGroup.currentUserRole}
                    onUpdatePrivacy={handleUpdatePrivacy}
                    isUpdatingPrivacy={updateGroupMutation.isPending}
                    isUpdatePrivacyError={updateGroupMutation.isError}
                    onLeave={handleLeaveGroup}
                    isLeaving={leaveGroupMutation.isPending}
                    isLeaveError={leaveGroupMutation.isError}
                    onRequestDelete={() => setIsDeleteConfirmOpen(true)}
                    groupSettings={settingsGuard.settings}
                    isSettingsLoading={settingsGuard.isSettingsLoading}
                    isSettingsError={settingsGuard.isSettingsError}
                    onUpdateSetting={settingsGuard.updateSettingField}
                    groupInfo={settingsGuard.info}
                    isGroupInfoLoading={settingsGuard.isInfoLoading}
                    isGroupInfoError={settingsGuard.isInfoError}
                    onUpdateGroupInfoField={settingsGuard.updateInfoField}
                    hasUnsavedSettingsChanges={settingsGuard.hasUnsavedChanges}
                    onSaveSettings={settingsGuard.save}
                    isSavingSettings={settingsGuard.isSaving}
                    isSaveSettingsError={settingsGuard.isSaveError}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <UpcomingMatches
            matches={data.upcomingMatches}
            activeSport={activeSport}
            sportsByKey={sportsByKey}
            onSeeAll={noop}
            onSelectMatch={noop}
          />
          <TrendingHashtags
            hashtags={data.hashtags}
            onHashtagClick={(tag) => {
              setActiveHashtag(tag);
              setIsHashtagModalOpen(true);
            }}
            isLoading={isHashtagsLoading}
            isError={isHashtagsError}
            onRetry={retryHashtags}
          />
          <GroupBroadcasts
            broadcasts={data.broadcasts}
            onBroadcastClick={noop}
            isLoading={isBroadcastsLoading}
            isError={isBroadcastsError}
            onRetry={retryBroadcasts}
          />
        </div>
      </div>
      <CommentSection
        isOpen={activeCommentsPostId !== null}
        onClose={() => setActiveCommentsPostId(null)}
        currentUserId={currentUserId}
        currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
        post={activeCommentsPost}
        sport={activeCommentsPostSport}
        isPostLoading={activeCommentsPostQuery.isLoading}
        isPostError={activeCommentsPostQuery.isError}
        comments={commentsData.data}
        isLoading={commentsData.isLoading}
        isError={commentsData.isError}
        hasMore={commentsData.hasMore}
        isFetchingMore={commentsData.isFetchingMore}
        onFetchMore={commentsData.fetchMore}
        onAddComment={commentsData.addComment}
        onAddReply={commentsData.addReply}
        isPosting={commentsData.isPosting}
        onDeleteComment={commentsData.deleteComment}
        onToggleCommentLike={commentsData.toggleCommentLike}
        onTogglePostLike={() => {
          // FEED-12: takes the already-resolved post directly — see
          // HomeFeedPage's own equivalent comment for the full reasoning.
          if (activeCommentsPost !== null) toggleLikeForPost(activeCommentsPost);
        }}
        onHashtagClick={(tag) => {
          // Symmetric with HashtagPostsModal's own "close first" behavior —
          // close the comment dialog before opening the hashtag modal,
          // rather than stacking two dialogs.
          setActiveCommentsPostId(null);
          setActiveHashtag(tag);
          setIsHashtagModalOpen(true);
        }}
      />
      <CreateGroupModal
        key={`create-group-${createGroupOpenCount}`}
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        sportsByKey={sportsByKey}
        lockedSport={lockedSport}
        initialGroupName={pendingCreateGroupName}
        isSubmitting={createGroupMutation.isPending}
        isError={createGroupMutation.isError}
        onSubmit={(payload) =>
          createGroupMutation.mutate(payload, {
            onSuccess: (group) => {
              selectGroupAndShowPosts(group.id, group.sportId);
              setIsCreateGroupOpen(false);
            },
          })
        }
      />
      <JoinGroupModal
        isOpen={isJoinGroupOpen}
        onClose={() => setIsJoinGroupOpen(false)}
        inputValue={joinGroupModalData.inputValue}
        onInputChange={joinGroupModalData.setInputValue}
        onSearch={joinGroupModalData.submitSearch}
        results={joinGroupModalData.results}
        isSearching={joinGroupModalData.isSearching}
        isSearchError={joinGroupModalData.isSearchError}
        pendingGroupIds={joinGroupModalData.pendingGroupIds}
        onRequestToJoin={joinGroupModalData.requestToJoin}
        isRequesting={joinGroupModalData.isRequesting}
        isRequestError={joinGroupModalData.isRequestError}
      />
      <InviteFriendModal
        key={`invite-friend-${inviteFriendOpenCount}`}
        isOpen={isInviteFriendOpen}
        onClose={() => setIsInviteFriendOpen(false)}
        initialQuery={inviteFriendQuery}
      />
      <AddSportModal
        key={`add-sport-${addSportOpenCount}`}
        isOpen={isAddSportOpen}
        onClose={() => setIsAddSportOpen(false)}
        availableSports={availableSports}
        isSubmitting={addSportMutation.isPending}
        isError={addSportMutation.isError}
        onSubmit={(payload) =>
          addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
        }
      />
      <HashtagPostsModal
        isOpen={isHashtagModalOpen}
        onClose={() => {
          setIsHashtagModalOpen(false);
          setActiveHashtag(null);
        }}
        tag={activeHashtag}
        posts={hashtagResultsData.data.posts}
        sportsByKey={sportsByKey}
        currentUserId={hashtagResultsData.currentUserId}
        onToggleLike={hashtagResultsData.toggleLike}
        onHashtagClick={(tag) => setActiveHashtag(tag)}
        onDeletePost={hashtagResultsData.deletePost}
        onOpenComments={(postId) => {
          // Hide the modal but keep `activeHashtag` set — see the state
          // declaration's comment for why clearing it here would break
          // usePost's own cache-seeding above.
          setIsHashtagModalOpen(false);
          setActiveCommentsPostId(postId);
        }}
        hasMorePosts={hashtagResultsData.hasMorePosts}
        isFetchingMorePosts={hashtagResultsData.isFetchingMorePosts}
        onLoadMore={hashtagResultsData.fetchMorePosts}
        isLoading={hashtagResultsData.isLoading}
        isError={hashtagResultsData.isError}
        onRetry={hashtagResultsData.retryPosts}
        isLoadMoreError={hashtagResultsData.isLoadMorePostsError}
      />
      <UpdateBroadcastConfirmDialog
        isOpen={pendingBroadcastContent !== null}
        onClose={() => setPendingBroadcastContent(null)}
        onConfirm={confirmUpdateBroadcast}
        isSubmitting={isUpdatingBroadcast}
        isError={isBroadcastUpdateError}
        existingText={activeBroadcastForSelectedGroup?.content ?? ''}
      />
      {selectedGroup !== null && (
        <DeleteGroupConfirmDialog
          isOpen={isDeleteConfirmOpen}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={handleConfirmDeleteGroup}
          isSubmitting={deleteGroupMutation.isPending}
          isError={deleteGroupMutation.isError}
          groupName={selectedGroup.groupName}
        />
      )}
      <SettingsUnsavedChangesDialog
        isOpen={settingsGuard.isLeaveDialogOpen}
        onCancel={settingsGuard.cancelLeave}
        onDiscard={settingsGuard.discard}
        onSave={settingsGuard.save}
        isSaving={settingsGuard.isSaving}
        isSaveError={settingsGuard.isSaveError}
      />
    </main>
  );
}
