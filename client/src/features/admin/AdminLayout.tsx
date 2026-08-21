import { NavLink, Outlet } from 'react-router-dom';

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
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Admin</h1>
        <p className="mt-1 text-2sm text-text-muted">
          Platform administration. Not linked from the main app.
        </p>
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
        <Outlet />
      </main>
    </div>
  );
}
