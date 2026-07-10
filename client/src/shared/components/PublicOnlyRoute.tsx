import { useRef, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { AuthLoadingState } from './AuthLoadingState';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

/**
 * Inverse of ProtectedRoute: wraps Login/Register so an already-authenticated
 * visitor (e.g. a stale bookmark, or pressing back after logging in) is sent
 * to Home Feed instead of being shown the form again. Waits for
 * isBootstrapping the same way ProtectedRoute does — deciding before the
 * initial refresh-on-load check resolves would flash the form for a user who
 * actually has a valid session, then yank it away a moment later.
 *
 * Deliberately always redirects to `/`, not a carried-over `from` — landing
 * here already authenticated isn't a "return to where I was" situation the
 * way ProtectedRoute's redirect is.
 *
 * The decision is locked in once bootstrap first resolves, via a ref, and
 * never reconsidered afterward — NOT re-evaluated on every render the way
 * ProtectedRoute's checks are. Without this, a successful login/register
 * completed on the wrapped page itself (setSession() populating user) would
 * make this component want to redirect too, racing LoginPage/RegisterPage's
 * own, more specific navigate(from) call — confirmed empirically: both fire
 * from the same setSession() update, and which one "wins" the resulting
 * route is not a guarantee this code should depend on. Once this component
 * has decided to render children (not authenticated yet), it keeps doing so
 * for its whole lifetime — any later auth change is the child page's own
 * navigation to handle, not this guard's.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const decision = useRef<'pending' | 'redirect' | 'render'>('pending');

  if (decision.current === 'pending') {
    if (isBootstrapping) {
      return <AuthLoadingState />;
    }
    decision.current = user ? 'redirect' : 'render';
  }

  if (decision.current === 'redirect') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
