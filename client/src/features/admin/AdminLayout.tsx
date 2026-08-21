import { Outlet } from 'react-router-dom';

/**
 * Shell for the `/admin` area (ADMIN-1).
 *
 * Deliberately plain, and deliberately **outside** `AppShell` — admin is not part
 * of the member-facing app chrome, so no TopBar and no NavTabs. The `<nav>` is an
 * empty slot today; admin sections add their own links as they land.
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

      {/* Section nav slot — empty until an admin section adds a link (ADMIN-2 is first). */}
      <nav aria-label="Admin sections" className="mt-4 empty:hidden" />

      <main className="mt-6">
        <Outlet />
      </main>
    </div>
  );
}
