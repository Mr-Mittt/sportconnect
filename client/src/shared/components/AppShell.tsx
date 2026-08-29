import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useLogout } from '@/features/auth/useLogout';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useNotificationBellData } from '@/features/notifications/useNotificationBellData';
import { useNotificationLiveSocket } from '@/features/notifications/useNotificationLiveSocket';
import { SessionDetailModal } from '@/features/session/components/SessionDetailModal';
import { useSessionDetailModalData } from '@/features/session/useSessionDetailModalData';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { AuthLoadingState } from './AuthLoadingState';
import { NavTabs, type NavTabKey } from './NavTabs';
import { TopBar } from './TopBar';

const pathByTab: Record<NavTabKey, string> = {
  home: '/',
  friends: '/friends',
  groups: '/groups',
  matches: '/matches',
  profile: '/profile',
};

function activeTabFromPath(pathname: string): NavTabKey {
  const entries = Object.entries(pathByTab) as Array<[NavTabKey, string]>;
  const match = entries.find(([, path]) => path !== '/' && pathname.startsWith(path));
  return match ? match[0] : 'home';
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * The cross-page shell every route renders inside (layout route): TopBar +
 * NavTabs above the page content, in the mockup's 960px centered frame.
 * NavTabs stays controlled — this is the parent that turns onChange into real
 * navigation, and derives the active tab from the URL. Only rendered inside
 * ProtectedRoute (AUTH-4), so authStore.user is guaranteed non-null here.
 *
 * SPORT-3: also the one place that triggers `useSportCatalog()` and mirrors
 * its result into `sportCatalogStore` — every protected page renders inside
 * this shell. `sportCatalogStore` is read via plain `.getState()` snapshots
 * (not the reactive hook form) in several places that can't call a hook —
 * `groupsPageStore.ts`'s `selectGroup`, most notably — so nothing downstream
 * automatically re-renders when the catalog finishes loading after the fact;
 * a `useEffect`-based sync would still let `<Outlet />`'s first render (same
 * commit, before effects run) see a stale/empty store. Calling
 * `setCatalog` directly in the render body instead (safe — it's a no-op
 * whenever `sportCatalog.data`'s memoized reference hasn't changed, see
 * `sportCatalogStore`'s own comment) plus gating `<Outlet />` behind
 * `sportCatalog.isLoading` (same `AuthLoadingState` idiom `ProtectedRoute`
 * already uses for AUTH-3's session bootstrap) closes the race at its
 * source: by the time any page mounts, the catalog is already in the store.
 *
 * CLIENT-NOTIF-1: also owns a shell-level `SessionDetailModal` instance,
 * fed by the same `useSessionDetailModalData` every page's own in-place
 * "View details" modal already uses — clicking a session-scoped notification
 * opens it as an overlay on whatever page the caller is currently on, no
 * navigation, no page switch (see `useNotificationBellData`'s own comment
 * for why this replaced an earlier `/matches?session={id}` navigation).
 * CLIENT-NOTIF-5: a friend-request notification (`entityType: 'USER'`, U13)
 * instead routes to `/friends` (the one notification type that navigates —
 * that section has no shell-level modal equivalent), passing the counterparty's
 * user id as router `state.focusPersonId` so the Friends page can pre-select
 * them (or explain, via a dialog, that the request is no longer available).
 */
export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user)!;
  const { logout } = useLogout({ onSettled: () => navigate('/login') });
  const sportCatalog = useSportCatalog();
  useSportCatalogStore.getState().setCatalog(sportCatalog.data);

  // NTF-3: live-updates NotificationBell's badge via the unread-count query
  // cache; only rendered here (inside the authenticated shell), matching
  // the fact that every page under it already assumes a logged-in user.
  useNotificationLiveSocket();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const sessionDetailData = useSessionDetailModalData(selectedSessionId);
  const sportProfilesQuery = useSportProfiles();
  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
  );

  const notificationBell = useNotificationBellData(setSelectedSessionId, (personId) =>
    navigate('/friends', { state: { focusPersonId: personId } }),
  );

  if (sportCatalog.isLoading) {
    return <AuthLoadingState />;
  }

  return (
    <div className="mx-auto w-full max-w-frame px-4 pb-8">
      <TopBar
        user={{
          initials: initialsOf(user.firstName, user.lastName),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        }}
        onLogout={logout}
        notificationBell={<NotificationBell {...notificationBell} />}
      />
      <NavTabs active={activeTabFromPath(pathname)} onChange={(tab) => navigate(pathByTab[tab])} />
      <Outlet />

      <SessionDetailModal
        isOpen={selectedSessionId !== null}
        onClose={() => {
          // CLIENT-MODAL-1: this dialog reopens for a different session, so a failed
          // join/leave/cancel would otherwise surface against the next one opened.
          sessionDetailData.resetActionErrors();
          setSelectedSessionId(null);
        }}
        session={sessionDetailData.selectedSession}
        sportsByKey={sportsByKey}
        isLoading={sessionDetailData.isSessionLoading}
        isError={sessionDetailData.isSessionError}
        participants={sessionDetailData.participants}
        isParticipantsLoading={sessionDetailData.isParticipantsLoading}
        isParticipantsError={sessionDetailData.isParticipantsError}
        currentUserId={sessionDetailData.currentUserId}
        canManage={sessionDetailData.canManage}
        onJoin={sessionDetailData.onJoin}
        isJoining={sessionDetailData.isJoining}
        isJoinError={sessionDetailData.isJoinError}
        onLeave={sessionDetailData.onLeave}
        isLeaving={sessionDetailData.isLeaving}
        isLeaveError={sessionDetailData.isLeaveError}
        onConfirmCancel={sessionDetailData.onConfirmCancel}
        isCancelling={sessionDetailData.isCancelling}
        isCancelError={sessionDetailData.isCancelError}
        requestedParticipants={sessionDetailData.requestedParticipants}
        isRequestedParticipantsLoading={sessionDetailData.isRequestedParticipantsLoading}
        isRequestedParticipantsError={sessionDetailData.isRequestedParticipantsError}
        onApproveParticipant={sessionDetailData.onApproveParticipant}
        isApprovingParticipant={sessionDetailData.isApprovingParticipant}
        onRejectParticipant={sessionDetailData.onRejectParticipant}
        isRejectingParticipant={sessionDetailData.isRejectingParticipant}
        onToggleLike={sessionDetailData.onToggleLike}
        isTogglingLike={sessionDetailData.isTogglingLike}
        currentUser={{ fullName: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl }}
        comments={sessionDetailData.comments}
        isCommentsLoading={sessionDetailData.isCommentsLoading}
        isCommentsError={sessionDetailData.isCommentsError}
        isCommentsForbidden={sessionDetailData.isCommentsForbidden}
        hasMoreComments={sessionDetailData.hasMoreComments}
        isFetchingMoreComments={sessionDetailData.isFetchingMoreComments}
        onFetchMoreComments={sessionDetailData.onFetchMoreComments}
        onAddComment={sessionDetailData.onAddComment}
        onAddCommentReply={sessionDetailData.onAddCommentReply}
        isPostingComment={sessionDetailData.isPostingComment}
        onDeleteComment={sessionDetailData.onDeleteComment}
        onToggleCommentLike={sessionDetailData.onToggleCommentLike}
      />
    </div>
  );
}
