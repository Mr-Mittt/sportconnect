import { useOutletContext } from 'react-router-dom';

/**
 * What `AdminLayout` hands down to its child routes through `<Outlet context={...} />`.
 *
 * This exists because ADMIN-4's logout button lives in `AdminLayout` while the state it
 * has to respect — whether an admin form has unsaved edits — lives in a *child* route
 * (`AdminSportsPage`). Props cannot flow upward across an `<Outlet />`, so the child
 * reports upward through this callback instead.
 */
export interface AdminOutletContext {
  /**
   * Report whether this admin section currently holds unsaved edits.
   *
   * Callers must report `false` on unmount, or a stale `true` left behind by a
   * section they navigated away from will keep prompting on every logout attempt.
   */
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
}

/**
 * Rendered outside `AdminLayout`, `useOutletContext` returns `null` — which is exactly
 * how ADMIN-2's `AdminSportsPage.test.tsx` mounts the page, and destructuring that would
 * throw. Falling back to a no-op keeps a section usable in isolation.
 *
 * The obvious risk in a no-op fallback is that mis-nesting a route silently disables the
 * guard instead of failing loudly. That is covered: `AdminLayout.test.tsx` exercises the
 * guard through the **real** route tree (`routes` from router.tsx), so a section wired up
 * outside the layout fails there rather than passing quietly.
 */
const NO_OP_CONTEXT: AdminOutletContext = { setHasUnsavedChanges: () => {} };

/**
 * Typed accessor for `AdminLayout`'s outlet context — `useOutletContext` is
 * `unknown`-typed by default, and every admin child route wants the same shape.
 */
export function useAdminOutletContext(): AdminOutletContext {
  return useOutletContext<AdminOutletContext | null>() ?? NO_OP_CONTEXT;
}
