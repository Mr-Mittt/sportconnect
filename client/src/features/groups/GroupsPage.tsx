import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useGroupsPageStore } from '@/app/groupsPageStore';
import { useCancelJoinRequest } from '@/features/feed/hooks/useCancelJoinRequest';
import { useCreateGroup } from '@/features/feed/hooks/useCreateGroup';
import { useDeleteGroup } from '@/features/feed/hooks/useDeleteGroup';
import { useJoinRequests } from '@/features/feed/hooks/useJoinRequests';
import { useLeaveGroup } from '@/features/feed/hooks/useLeaveGroup';
import { usePost } from '@/features/feed/hooks/usePost';
import { useUpdateGroup } from '@/features/feed/hooks/useUpdateGroup';
import { sportIdForKey, sportKeyForId } from '@/features/feed/sportIdMap';
import { useCommentsData } from '@/features/feed/useCommentsData';
import { useHashtagResultsData } from '@/features/feed/useHashtagResultsData';
import { CreateSessionModal } from '@/features/session/components/CreateSessionModal';
import { SessionDetailModal } from '@/features/session/components/SessionDetailModal';
import { SessionDiscoverModal } from '@/features/session/components/SessionDiscoverModal';
import { useSessionParticipationAction } from '@/features/session/hooks/useSessionParticipationAction';
import { useCreateSessionModalData } from '@/features/session/useCreateSessionModalData';
import { useDiscoverModalData } from '@/features/session/useDiscoverModalData';
import { AddSportIntroDialog } from '@/shared/components/AddSportIntroDialog';
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
import { NoSportsToAddDialog } from '@/shared/components/NoSportsToAddDialog';
import { useAddSportLauncher } from '@/shared/hooks/useAddSportLauncher';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useAnchorBottom, ModalAnchorProvider } from '@/shared/lib/modalAnchor';
import { PAGE_ACCESS_NO_SPORTS_PROMPT } from '@/shared/lib/noSportsPrompt';
import { getSportProfileConfig } from '@/shared/lib/sportProfileConfig';
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
import { RejectInvitationConfirmDialog } from './components/RejectInvitationConfirmDialog';
import { SettingsUnsavedChangesDialog } from './components/SettingsUnsavedChangesDialog';
import { useGroupInvitationsData } from './useGroupInvitationsData';
import { useGroupMembersTabData } from './useGroupMembersTabData';
import { useGroupsPageData } from './useGroupsPageData';
import { useInviteFriendModalData } from './useInviteFriendModalData';
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
 * activeSport is read from this page's own `groupsPageStore` — independent
 * of Home Feed's `homeFeedStore` (2026-07-25 decision, reversing FEED-4's
 * original single shared store, which let switching sport on one page
 * silently affect the other). GroupSpaceSwitcher's group list is filtered to
 * that sport (a group is 1:1 with a sport, so this is exact). CreatePostForm
 * only renders when a specific group is selected — "All" has no single
 * group to post into.
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
  const navigate = useNavigate();
  const activeSport = useGroupsPageStore((state) => state.activeSport);
  const setActiveSport = useGroupsPageStore((state) => state.setActiveSport);
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
  // GRP-3: Members tab's "Invite friend". GRP-4: search/invite state now
  // lives in useInviteFriendModalData below (re-seeded per open via its own
  // ref, same as useJoinGroupModalData) — no more key-remount trick.
  const [isInviteFriendOpen, setIsInviteFriendOpen] = useState(false);
  const [inviteFriendQuery, setInviteFriendQuery] = useState('');
  // GRP-1: which of the per-group tabs is showing. Reset to 'posts' at every
  // point that changes `selectedGroupId` (see `selectGroupAndShowPosts`
  // below) rather than via an effect, per React's own guidance to avoid
  // synchronous setState-in-effect.
  const [activeGroupTab, setActiveGroupTab] = useState<GroupTabKey>('posts');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // Bumped on every open (not close) — remounts CreateGroupModal/AddSportModal
  // so their internal form field state starts fresh each time, without an
  // effect calling setState. JoinGroupModal/InviteFriendModal don't need
  // this — their search state lives in useJoinGroupModalData/
  // useInviteFriendModalData below, not in the components themselves.
  const [createGroupOpenCount, setCreateGroupOpenCount] = useState(0);
  const [addSportOpenCount, setAddSportOpenCount] = useState(0);
  // GRP-8 part 2: which received invitation is mid-reject — doubles as
  // RejectInvitationConfirmDialog's open state, same convention as
  // pendingBroadcastContent.
  const [rejectingInvitationId, setRejectingInvitationId] = useState<number | null>(null);
  // GRP-8 part 5: an invitation whose accept is paused pending the invitee
  // adding the group's sport to their own profile first. `step` tracks which
  // of the two dialogs (the plain-copy intro, then AddSportModal itself) is
  // currently showing — doubles as both dialogs' open state.
  const [sportGate, setSportGate] = useState<{
    invitationId: number;
    sportKey: SportKey;
    step: 'intro' | 'form';
  } | null>(null);
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
    resetBroadcastUpdate,
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
  );
  const guardedSetActiveGroupTab = (tab: GroupTabKey) =>
    settingsGuard.guard(() => setActiveGroupTab(tab));
  const guardedSelectGroupAndShowPosts = (groupId: number | null, groupSportId?: number | null) =>
    settingsGuard.guard(() => selectGroupAndShowPosts(groupId, groupSportId));
  const commentsData = useCommentsData(activeCommentsPostId ?? -1, activeCommentsPostId !== null);
  const activeCommentsPostQuery = usePost(
    activeCommentsPostId ?? -1,
    activeCommentsPostId !== null,
  );
  const hashtagResultsData = useHashtagResultsData(activeHashtag, activeHashtag !== null);
  const createGroupMutation = useCreateGroup(currentUserId);
  const addSportMutation = useAddSportProfile(currentUserId);

  // Zero-sport-profile gate on page access (not just on create/join a match — see
  // CreateSessionModal/SessionDiscoverModal's own inline gate for that): a caller who lands here
  // with no sport profile at all gets the same AddSportModal the SportSwitcher's own "+" pill
  // opens, prompted automatically once (not on every render/refetch, and not re-shown just
  // because they close it — `hasAutoPromptedAddSportRef` latches after the first prompt) — with
  // the same funny copy the create/join gates use, via `addSportPromptMessage` (cleared when the
  // "+" pill opens the modal manually instead, so that open stays plain).
  // `useSportProfiles()` here is a second subscription to the same query `data.sportProfiles`
  // already comes from (deduped by TanStack Query, not a second request) — needed for its own
  // `isLoading`, which `useGroupsPageData` doesn't expose separately.
  const sportProfilesQuery = useSportProfiles();
  const hasAutoPromptedAddSportRef = useRef(false);
  // Latched synchronously (not effect-derived) the moment `handleAcceptInvitation` below engages
  // GRP-8 part 5's own sport gate — guards the auto-prompt effect against a real race: accepting
  // that invitation transiently drives `invitations.length` to 0 before the sport-profiles query
  // refetches to reflect the newly added sport, and an effect keyed on that data alone would
  // re-fire the generic prompt on top of the flow that just handled it. A ref set at the actual
  // decision point sidesteps that instead of trying to infer it from query timing.
  const hasEngagedInvitationSportGateRef = useRef(false);
  const [addSportPromptMessage, setAddSportPromptMessage] = useState<string | undefined>(undefined);

  const lockedSport = activeSport !== 'all' ? activeSport : null;
  const joinGroupModalData = useJoinGroupModalData(
    currentUserId,
    lockedSport,
    data.sportProfiles,
    isJoinGroupOpen,
  );
  // GRP-4
  const inviteFriendModalData = useInviteFriendModalData(
    selectedGroupId ?? undefined,
    isInviteFriendOpen,
    inviteFriendQuery,
  );

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(data.sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [data.sportProfiles],
  );
  const sportCatalog = useSportCatalog();
  const availableSports = useMemo(
    () =>
      sportCatalog.data
        .map((sport) => sport.key)
        .filter((key) => !data.sportProfiles.some((sport) => sport.key === key)),
    [sportCatalog.data, data.sportProfiles],
  );

  // GRP-1: the full selected Group (cover banner, Settings tab) — found in
  // `data.groups`, which is sport-filtered by this page's own `activeSport`
  // (`groupsPageStore`, independent of Home Feed's — 2026-07-25 decision).
  // Since only this page's own actions ever write to `activeSport` now
  // (`selectGroup`'s derivation, or `guardedSetActiveSport`'s explicit
  // deselect below), the two never drift apart — `data.groups` is
  // guaranteed to contain the selection whenever one exists.
  const selectedGroup = data.groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedGroupSportKey =
    selectedGroup !== null ? sportKeyForId(selectedGroup.sportId) : undefined;
  const selectedGroupSport =
    selectedGroupSportKey !== undefined ? sportsByKey[selectedGroupSportKey] : undefined;
  // Switching the sport pill can make the currently open group no longer
  // make sense to keep showing — either because "All" was picked (no single
  // group belongs to "All"), or because a different, incompatible sport was
  // picked. Routed through the existing unsaved-Settings-changes guard, same
  // as every other action that can navigate away from a group's Settings
  // tab, so a pending draft isn't discarded silently.
  const guardedSetActiveSport = (sport: SportKey | 'all') =>
    settingsGuard.guard(() => {
      setActiveSport(sport);
      const stillCompatible = selectedGroup !== null && sport === selectedGroupSportKey;
      if (selectedGroup !== null && !stillCompatible) {
        selectGroup(null);
      }
    });

  // GRP-3
  const membersTabData = useGroupMembersTabData(
    selectedGroup?.id,
    activeGroupTab === 'members',
    selectedGroup?.currentUserRole ?? null,
  );

  // GRP-7/GRP-8 part 1: accepting an invitation lands the user straight in
  // the newly joined group, sport pill included. GroupInvitationResponse now
  // carries sportId (B15), so this calls selectGroupAndShowPosts with both
  // ids directly — same shape as every other selection call site — instead
  // of GRP-7's original setActiveSport('all')-then-select detour (that
  // workaround existed only because the invitation carried no sportId yet).
  const groupInvitationsData = useGroupInvitationsData(
    currentUserId,
    selectedGroup === null,
    (groupId, sportId) => selectGroupAndShowPosts(groupId, sportId),
  );

  // Zero-sport-profile gate on page access (not just on create/join a match — see
  // CreateSessionModal/SessionDiscoverModal's own inline gate for that): a caller who lands here
  // with no sport profile at all gets the same AddSportModal the SportSwitcher's own "+" pill
  // opens, prompted automatically once (not on every render/refetch, and not re-shown just
  // because they close it — `hasAutoPromptedAddSportRef` latches after the first prompt) — with
  // the same funny copy the create/join gates use, via `addSportPromptMessage` (cleared when the
  // "+" pill opens the modal manually instead, so that open stays plain). Skipped entirely while
  // there's a pending received invitation to show instead, or once the invitee has ever engaged
  // GRP-8 part 5's own sport gate (`hasEngagedInvitationSportGateRef`, latched in
  // `handleAcceptInvitation` below) — that gate already owns the moment for whichever sport the
  // invitation is for, and this generic prompt racing it would either steal focus from the
  // Invitations section or open a redundant, wrongly-defaulted AddSportModal on top of it.
  useEffect(() => {
    if (
      hasAutoPromptedAddSportRef.current ||
      hasEngagedInvitationSportGateRef.current ||
      sportProfilesQuery.isLoading ||
      sportProfilesQuery.data.length > 0 ||
      groupInvitationsData.isLoading ||
      groupInvitationsData.invitations.length > 0
    ) {
      return;
    }
    hasAutoPromptedAddSportRef.current = true;
    setAddSportPromptMessage(PAGE_ACCESS_NO_SPORTS_PROMPT);
    setAddSportOpenCount((count) => count + 1);
    setIsAddSportOpen(true);
  }, [
    sportProfilesQuery.isLoading,
    sportProfilesQuery.data.length,
    groupInvitationsData.isLoading,
    groupInvitationsData.invitations.length,
  ]);

  // GRP-8 part 3: the current user's own pending join requests — same query
  // JoinGroupModal's "already requested" badge already reads, just rendered
  // here too.
  const joinRequestsQuery = useJoinRequests(currentUserId);
  const cancelJoinRequestMutation = useCancelJoinRequest();

  // GRP-8 part 5: gate accepting an invitation on the invitee already having
  // a profile for the group's sport. sportKeyForId returning undefined (an
  // invitation for a sport the client doesn't map yet) skips the gate
  // entirely and accepts directly — same "unknown sport, don't block"
  // precedent as useSportProfilesForUser's own silent drop.
  const handleAcceptInvitation = (invitationId: number) => {
    const invitation = groupInvitationsData.invitations.find(
      (candidate) => candidate.id === invitationId,
    );
    if (invitation === undefined) return;
    const sportKey = sportKeyForId(invitation.sportId);
    const hasSportProfile =
      sportKey === undefined || data.sportProfiles.some((sport) => sport.key === sportKey);
    if (!hasSportProfile && sportKey !== undefined) {
      hasEngagedInvitationSportGateRef.current = true;
      setSportGate({ invitationId, sportKey, step: 'intro' });
      return;
    }
    groupInvitationsData.acceptInvitation(invitationId);
  };

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
    setIsInviteFriendOpen(true);
  };

  // FEED-12: comes from usePost, not a feed-cache lookup — see
  // HomeFeedPage's own equivalent comment for the full reasoning.
  const activeCommentsPost = activeCommentsPostQuery.data ?? null;
  const activeCommentsPostSportKey =
    activeCommentsPost !== null ? sportKeyForId(activeCommentsPost.sportId) : undefined;
  const activeCommentsPostSport =
    activeCommentsPostSportKey !== undefined
      ? (sportsByKey[activeCommentsPostSportKey] ?? null)
      : null;

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

  const modalAnchorRef = useRef<HTMLDivElement>(null);
  const modalAnchorBottom = useAnchorBottom(modalAnchorRef);
  // Every modal on this page anchors under the group pill row specifically (user decision) —
  // separate from `modalAnchorRef` above, which still measures through the group cover banner
  // too (when one's rendered) for `groupChatBoxHeight` below; that's an unrelated sizing concern
  // (the Chat tab's box genuinely starts below the banner+tabs) and would be wrong if it moved.
  const pillRowAnchorRef = useRef<HTMLDivElement>(null);
  const pillRowAnchorBottom = useAnchorBottom(pillRowAnchorRef);

  // CLIENT-SESSION-7: UpcomingMatches' empty-state CTAs — same pattern as HomeFeedPage.
  // SPORT-5: re-read the catalogue before opening anything — see useAddSportLauncher.
  const addSportLauncher = useAddSportLauncher({
    heldSportKeys: data.sportProfiles.map((sport) => sport.key),
    onOpenPicker: () => {
      setAddSportPromptMessage(undefined);
      setAddSportOpenCount((count) => count + 1);
      setIsAddSportOpen(true);
    },
  });

  const createSessionModalData = useCreateSessionModalData();
  const activeSessionSportId = activeSport === 'all' ? undefined : sportIdForKey(activeSport);
  const discoverModalData = useDiscoverModalData(activeSessionSportId);

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
  // CLIENT-SESSION-9: separate instance from discoverModalData's own — this one backs the rail
  // card's action button, that one backs the Discover modal's result-grid cards.
  const railParticipationAction = useSessionParticipationAction();
  // Chat only (user decision, after Members/Settings/Posts all being forced
  // to the same viewport-derived height left short tabs with a large empty
  // gap below them — found live): the group box's height reaches the
  // browser's bottom edge, so the compose input never needs a page scroll to
  // reach, but only while the Chat tab is active. A hard `height`, not
  // `min-height` — GroupChatTabView already scrolls its own message list
  // internally (unlike Members/Posts), so there's no risk of clipping a
  // long conversation the way a min-height tab without that internal
  // scroll would just grow past the viewport instead.
  const groupChatBoxHeight =
    modalAnchorBottom !== null ? `calc(100vh - ${modalAnchorBottom}px - 1.5rem)` : undefined;

  // The height above is measured via getBoundingClientRect(), which is
  // viewport-relative — if the page itself can still scroll, scrolling it
  // moves the anchor element up, shrinking `modalAnchorBottom` and growing
  // the computed chat height without bound (found live: "the chat content
  // keeps extending" while scrolling). Freezing page scroll while Chat is
  // active removes the only thing that could move the anchor, keeping the
  // height stable — the message list's own internal scroll (already
  // present) is what the user actually scrolls at that point.
  useEffect(() => {
    if (activeGroupTab !== 'chat' || selectedGroupId === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeGroupTab, selectedGroupId]);

  return (
    <ModalAnchorProvider value={pillRowAnchorBottom}>
      <main className="py-4">
        <h1 className="sr-only">Groups</h1>
        <div className="mb-3">
          <SportSwitcher
            sports={data.sportProfiles}
            active={activeSport}
            onChange={guardedSetActiveSport}
            maxSports={sportCatalog.data.length || undefined}
            isCheckingCatalog={addSportLauncher.isCheckingCatalog}
            onAddSport={addSportLauncher.launch}
          />
        </div>
        {/* Every modal on this page positions below the group pill row specifically (user
          decision) — regardless of whether the cover banner is also showing underneath it.
          `modalAnchorRef` on the outer wrapper still measures through the banner too, for
          `groupChatBoxHeight` below (a separate, correct concern). */}
        <div ref={modalAnchorRef}>
          <div className="mb-4" ref={pillRowAnchorRef}>
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
        </div>
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
                invitations={groupInvitationsData.invitations}
                isInvitationsLoading={groupInvitationsData.isLoading}
                isInvitationsError={groupInvitationsData.isError}
                onRetryInvitations={groupInvitationsData.retry}
                onAcceptInvitation={handleAcceptInvitation}
                onRejectInvitation={setRejectingInvitationId}
                isAcceptingInvitation={groupInvitationsData.isAccepting}
                isRejectingInvitation={groupInvitationsData.isRejecting}
                joinRequests={joinRequestsQuery.data?.content ?? []}
                isJoinRequestsLoading={joinRequestsQuery.isLoading}
                isJoinRequestsError={joinRequestsQuery.isError}
                onRetryJoinRequests={() => joinRequestsQuery.refetch()}
                onWithdrawJoinRequest={(requestId) => cancelJoinRequestMutation.mutate(requestId)}
                isWithdrawingJoinRequest={cancelJoinRequestMutation.isPending}
              />
            ) : (
              <div
                className="border-hairline flex gap-3.5 rounded-xl border-border bg-surface-2 p-3.5"
                style={activeGroupTab === 'chat' ? { height: groupChatBoxHeight } : undefined}
              >
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
                    <GroupChatTab
                      key={selectedGroup.id}
                      groupId={selectedGroup.id}
                      currentUserId={user.id}
                    />
                  )}
                  {activeGroupTab === 'members' && (
                    <GroupMembersTab
                      canManage={membersTabData.canManage}
                      currentUserId={currentUserId}
                      approvalQueue={membersTabData.approvalQueue}
                      isApprovalQueueLoading={membersTabData.isApprovalQueueLoading}
                      isApprovalQueueError={membersTabData.isApprovalQueueError}
                      onRetryApprovalQueue={membersTabData.retryApprovalQueue}
                      onAcceptItem={membersTabData.acceptApprovalQueueItem}
                      onDeclineItem={membersTabData.declineApprovalQueueItem}
                      isAcceptingItem={membersTabData.isAcceptingApprovalQueueItem}
                      isDecliningItem={membersTabData.isDecliningApprovalQueueItem}
                      sentInvitations={membersTabData.sentInvitations}
                      isSentInvitationsLoading={membersTabData.isSentInvitationsLoading}
                      isSentInvitationsError={membersTabData.isSentInvitationsError}
                      onRetrySentInvitations={membersTabData.retrySentInvitations}
                      onCancelInvitation={membersTabData.cancelInvitation}
                      isCancelingInvitation={membersTabData.isCancelingInvitation}
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
              currentUserId={discoverModalData.currentUserId ?? ''}
              onSeeAll={() => navigate('/matches')}
              onViewDetails={discoverModalData.onViewDetails}
              onCreateMatch={createSessionModalData.openCreateModal}
              onJoinMatch={discoverModalData.openDiscoverModal}
              onParticipationAction={railParticipationAction.onParticipationAction}
              isParticipationActionPending={railParticipationAction.isParticipationActionPending}
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
          currentUser={{
            fullName: `${user.firstName} ${user.lastName}`,
            avatarUrl: user.avatarUrl,
          }}
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
          onClose={() => {
            createGroupMutation.reset();
            setIsCreateGroupOpen(false);
          }}
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
          sportProfiles={data.sportProfiles}
          selectedSports={joinGroupModalData.selectedSports}
          onToggleSport={joinGroupModalData.toggleSport}
          groupedResults={joinGroupModalData.groupedResults}
          isSearching={joinGroupModalData.isSearching}
          isSearchError={joinGroupModalData.isSearchError}
          pendingGroupIds={joinGroupModalData.pendingGroupIds}
          onRequestToJoin={joinGroupModalData.requestToJoin}
          isRequesting={joinGroupModalData.isRequesting}
          isRequestError={joinGroupModalData.isRequestError}
        />
        <InviteFriendModal
          isOpen={isInviteFriendOpen}
          onClose={() => setIsInviteFriendOpen(false)}
          inputValue={inviteFriendModalData.inputValue}
          onInputChange={inviteFriendModalData.setInputValue}
          rows={inviteFriendModalData.rows}
          isSearching={inviteFriendModalData.isSearching}
          isSearchError={inviteFriendModalData.isSearchError}
          onInvite={inviteFriendModalData.sendInvite}
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
          isSubmitting={addSportMutation.isPending}
          isError={addSportMutation.isError}
          onSubmit={(payload) =>
            addSportMutation.mutate(payload, { onSuccess: () => setIsAddSportOpen(false) })
          }
          promptMessage={addSportPromptMessage}
        />
        <RejectInvitationConfirmDialog
          key={rejectingInvitationId ?? 'none'}
          isOpen={rejectingInvitationId !== null}
          onClose={() => {
            groupInvitationsData.resetReject();
            setRejectingInvitationId(null);
          }}
          onConfirm={(reason) => {
            if (rejectingInvitationId === null) return;
            groupInvitationsData.rejectInvitation(rejectingInvitationId, reason);
            setRejectingInvitationId(null);
          }}
          isSubmitting={groupInvitationsData.isRejecting}
          isError={groupInvitationsData.isRejectError}
          groupName={
            groupInvitationsData.invitations.find((inv) => inv.id === rejectingInvitationId)
              ?.groupName ?? ''
          }
        />
        {/* GRP-8 part 5: two-step gate before accepting an invitation for a
          sport the invitee has no profile for — the plain-copy intro first
          (OK button, decoupled from the form per user decision), then the
          existing AddSportModal pre-selected to just that one sport. */}
        <AddSportIntroDialog
          isOpen={sportGate?.step === 'intro'}
          onClose={() => setSportGate(null)}
          onConfirm={() =>
            setSportGate((current) => (current !== null ? { ...current, step: 'form' } : null))
          }
          sportName={sportGate !== null ? getSportProfileConfig(sportGate.sportKey).label : ''}
        />
        <AddSportModal
          key={`sport-gate-${sportGate?.invitationId ?? 'none'}`}
          isOpen={sportGate?.step === 'form'}
          onClose={() => {
            addSportMutation.reset();
            setSportGate(null);
          }}
          availableSports={sportGate !== null ? [sportGate.sportKey] : []}
          isSubmitting={addSportMutation.isPending}
          isError={addSportMutation.isError}
          onSubmit={(payload) =>
            addSportMutation.mutate(payload, {
              onSuccess: () => {
                if (sportGate !== null)
                  groupInvitationsData.acceptInvitation(sportGate.invitationId);
                setSportGate(null);
              },
            })
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
          onClose={() => {
            resetBroadcastUpdate();
            setPendingBroadcastContent(null);
          }}
          onConfirm={confirmUpdateBroadcast}
          isSubmitting={isUpdatingBroadcast}
          isError={isBroadcastUpdateError}
          existingText={activeBroadcastForSelectedGroup?.content ?? ''}
        />
        {selectedGroup !== null && (
          <DeleteGroupConfirmDialog
            isOpen={isDeleteConfirmOpen}
            onClose={() => {
              deleteGroupMutation.reset();
              setIsDeleteConfirmOpen(false);
            }}
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
        <CreateSessionModal
          key={createSessionModalData.isCreateModalOpen ? 'open' : 'closed'}
          isOpen={createSessionModalData.isCreateModalOpen}
          onClose={closeCreateSessionModal}
          sportsByKey={sportsByKey}
          activeSport={activeSport}
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
