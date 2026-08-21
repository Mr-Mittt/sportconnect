import { IconLogout } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogout } from '@/features/auth/useLogout';
import { Button } from '@/shared/ui/button';
import { AdminUnsavedChangesDialog } from './components/AdminUnsavedChangesDialog';
import type { AdminOutletContext } from './useAdminOutletContext';

/**
 * Shell for the `/admin` area (ADMIN-1).
 *
 * Deliberately plain, and deliberately **outside** `AppShell` — admin is not part
 * of the member-facing app chrome, so no TopBar and no NavTabs. The `<nav>` holds
 * one link per admin section; ADMIN-2 added the first ("Sports").
 *
 * This component does no access checking of its own. The `/admin` route wraps it
 * in `ProtectedRoute requiredRole="ADMIN"`, and every admin API endpoint enforces
 * `hasRole('ADMIN')` server-side independently — this guard hides UI, it does not
 * protect data.
 */
export function AdminLayout() {
  const navigate = useNavigate();
  const { logout, isPending } = useLogout({ onSettled: () => navigate('/login') });

  // ADMIN-4: reported upward by whichever admin section is mounted (see
  // useAdminOutletContext). Held here rather than in the section because the
  // control that has to respect it — Log out — lives in this header.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);

  // Stable identity: child routes report through this from an effect, so a new
  // function every render would re-fire that effect on every parent render.
  const reportUnsavedChanges = useCallback((next: boolean) => setHasUnsavedChanges(next), []);
  const outletContext: AdminOutletContext = { setHasUnsavedChanges: reportUnsavedChanges };

  // Guard the *action*, not the navigation. `useBlocker` (GRP-2's other mechanism)
  // is wrong here: logout POSTs first and only navigates in useLogout's onSettled,
  // so a blocker would fire after the session had already been cleared server-side,
  // stranding a logged-out user on the page.
  const handleLogoutClick = () => {
    if (hasUnsavedChanges) {
      setIsLeaveDialogOpen(true);
      return;
    }
    logout();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
          <p className="mt-1 text-2sm text-text-muted">
            Platform administration. Not linked from the main app.
          </p>
        </div>

        {/* Session control, not the member chrome ADMIN-1 excluded: without this,
            `/admin` has no way out at all, since TopBar (the app's only other
            logout control) is part of AppShell and deliberately absent here. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleLogoutClick}
          disabled={isPending}
        >
          <IconLogout className="size-4" aria-hidden="true" />
          {isPending ? 'Logging out…' : 'Log out'}
        </Button>
      </header>

      {/* Section nav — ADMIN-2 filled the slot ADMIN-1 left empty. */}
      <nav aria-label="Admin sections" className="mt-4 flex gap-3 empty:hidden">
        <NavLink
          to="/admin/sports"
          className={({ isActive }) =>
            `text-2sm font-medium underline-offset-4 hover:underline ${
              isActive ? 'text-text-accent' : 'text-text-secondary'
            }`
          }
        >
          Sports
        </NavLink>
      </nav>

      <main className="mt-6">
        <Outlet context={outletContext} />
      </main>

      <AdminUnsavedChangesDialog
        isOpen={isLeaveDialogOpen}
        onCancel={() => setIsLeaveDialogOpen(false)}
        onDiscard={() => {
          setIsLeaveDialogOpen(false);
          logout();
        }}
      />
    </div>
  );
}
