import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { AuthLoadingState } from './AuthLoadingState';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

type Decision = 'pending' | 'redirect' | 'render';

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
 * The decision is locked in once bootstrap first resolves, and never
 * reconsidered afterward — NOT re-evaluated on every render the way
 * ProtectedRoute's checks are. Without this, a successful login/register
 * completed on the wrapped page itself (setSession() populating user) would
 * make this component want to redirect too, racing LoginPage/RegisterPage's
 * own, more specific navigate(from) call — confirmed empirically: both fire
 * from the same setSession() update, and which one "wins" the resulting
 * route is not a guarantee this code should depend on. Once this component
 * has decided to render children (not authenticated yet), it keeps doing so
 * for its whole lifetime — any later auth change is the child page's own
 * navigation to handle, not this guard's.
 *
 * The lock is implemented by calling setState conditionally during render
 * (React's own documented pattern for "adjust state once, then stop" — see
 * "You Might Not Need an Effect"), not a ref: eslint-plugin-react-hooks v7's
 * `react-hooks/refs` forbids reading/writing ref.current during render, and
 * `react-hooks/set-state-in-effect` forbids the effect-based version of this
 * same idea. `setDecision` only ever fires while `decision` is still
 * `'pending'`; the moment it isn't, this branch stops running, so the value
 * sticks for the rest of this component instance's lifetime.
 */
export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const [decision, setDecision] = useState<Decision>('pending');

  if (decision === 'pending' && !isBootstrapping) {
    setDecision(user ? 'redirect' : 'render');
  }

  if (decision === 'pending') {
    return <AuthLoadingState />;
  }

  if (decision === 'redirect') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
