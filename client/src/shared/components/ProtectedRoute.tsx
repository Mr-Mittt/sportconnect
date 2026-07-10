import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { AuthLoadingState } from './AuthLoadingState';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

/**
 * Route guard for authenticated-only pages. Waits for AUTH-3's initial
 * refresh-on-load check (authStore.isBootstrapping) before deciding
 * anything — otherwise a logged-in user would see a flash of the redirect
 * on every hard refresh, while the check is still in flight.
 *
 * No user after bootstrap resolves -> /login, carrying the attempted path
 * in router state so LoginPage/RegisterPage can send the user back to where
 * they were headed instead of always landing on Home Feed.
 *
 * requiredRole given and missing from user.roles -> redirected to Home Feed
 * (no dedicated "unauthorized" page exists; no route uses requiredRole yet).
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) {
    return <AuthLoadingState />;
  }

  if (!user) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  if (requiredRole && !user.roles.includes(requiredRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
