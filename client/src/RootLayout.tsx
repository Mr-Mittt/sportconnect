import { Outlet } from 'react-router-dom';
import { useSessionBootstrap } from './features/auth/useSessionBootstrap';

/**
 * Root route element for the data router (router.tsx). Restores the session
 * from the httpOnly refresh cookie on every app load, regardless of route
 * (AUTH-3) — moved here from the old App component when the app migrated to
 * createBrowserRouter/RouterProvider (ROUTER-1, filed during GRP-2).
 */
export function RootLayout() {
  useSessionBootstrap();
  return <Outlet />;
}
