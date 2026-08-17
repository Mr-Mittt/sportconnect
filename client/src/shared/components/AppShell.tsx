import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useLogout } from '@/features/auth/useLogout';
import { useNotificationLiveSocket } from '@/features/notifications/useNotificationLiveSocket';
import { useUnreadNotificationCount } from '@/features/notifications/useUnreadNotificationCount';
import { useSportCatalog } from '@/shared/hooks/useSportCatalog';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
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
 */
export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user)!;
  const { logout } = useLogout({ onSettled: () => navigate('/login') });
  const sportCatalog = useSportCatalog();
  useSportCatalogStore.getState().setCatalog(sportCatalog.data);

  // NTF-3: live-updates the TopBar badge below via the unread-count query
  // cache; only rendered here (inside the authenticated shell), matching
  // the fact that every page under it already assumes a logged-in user.
  useNotificationLiveSocket();
  const { data: unreadCount } = useUnreadNotificationCount();

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
        unreadCount={unreadCount}
      />
      <NavTabs active={activeTabFromPath(pathname)} onChange={(tab) => navigate(pathByTab[tab])} />
      <Outlet />
    </div>
  );
}
