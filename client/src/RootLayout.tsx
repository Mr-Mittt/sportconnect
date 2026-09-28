import { Outlet } from 'react-router-dom';
import { useSyncUserLocale } from './app/useSyncUserLocale';
import { useSessionBootstrap } from './features/auth/useSessionBootstrap';

/**
 * Root route element for the data router (router.tsx). Restores the session
 * from the httpOnly refresh cookie on every app load, regardless of route
 * (AUTH-3) — moved here from the old App component when the app migrated to
 * createBrowserRouter/RouterProvider (ROUTER-1, filed during GRP-2).
 *
 * CLIENT-I18N-1: also syncs the signed-in user's stored language into
 * `localeStore`, same "every route, once per session" placement as
 * `useSessionBootstrap` — a user can land on any route first (a bookmark, a
 * deep link), not just `/`.
 */
export function RootLayout() {
  useSessionBootstrap();
  useSyncUserLocale();
  return <Outlet />;
}
