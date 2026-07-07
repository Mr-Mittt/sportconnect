import { Outlet, useLocation, useNavigate } from 'react-router-dom';
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

/**
 * The cross-page shell every route renders inside (layout route): TopBar +
 * NavTabs above the page content, in the mockup's 960px centered frame.
 * NavTabs stays controlled — this is the parent that turns onChange into real
 * navigation, and derives the active tab from the URL.
 */
export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="mx-auto w-full max-w-frame px-4 pb-8">
      {/* userInitials is the mockup's placeholder value until AUTH-0 provides the real user */}
      <TopBar userInitials="BN" />
      <NavTabs active={activeTabFromPath(pathname)} onChange={(tab) => navigate(pathByTab[tab])} />
      <Outlet />
    </div>
  );
}
