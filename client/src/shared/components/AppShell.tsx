import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { useLogout } from '@/features/auth/useLogout';
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
 */
export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user)!;
  const { logout } = useLogout({ onSettled: () => navigate('/login') });

  return (
    <div className="mx-auto w-full max-w-frame px-4 pb-8">
      <TopBar
        user={{
          initials: initialsOf(user.firstName, user.lastName),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        }}
        onLogout={logout}
      />
      <NavTabs active={activeTabFromPath(pathname)} onChange={(tab) => navigate(pathByTab[tab])} />
      <Outlet />
    </div>
  );
}
