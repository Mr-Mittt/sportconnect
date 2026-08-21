# ADMIN-4 · Log out from the admin area

**Status:** `TODO` · **Type:** Enhancement · **Depends on:** none (`AUTH-4` and `ADMIN-1` both `DONE`) ·
**Filed:** 2026-08-21 — noticed that `ADMIN-1` deliberately placed `/admin` outside `AppShell`, and
that decision left the admin area with no session exit at all. **Widened at filing** (user decision)
from a bare logout button to also cover the unsaved-changes guard, since logging out is the first
exit path anyone will actually use from a dirty admin form.

Add a logout control to the `/admin` shell so an Admin can end their session without first navigating
back to the member-facing app. It renders in `AdminLayout`'s header and is therefore present on every
admin route (`/admin`, `/admin/sports`, `/admin/sports/:sportId`). No inputs; clicking it runs the
existing `useLogout()` mutation, which POSTs `/auth/logout`, clears the auth store `onSettled`, and
redirects to `/login` — the same destination `AppShell` sends a member to.

**The mechanism already exists; only the control is missing.** `AUTH-4` shipped
`src/features/auth/useLogout.ts`, and nothing about it is TopBar-specific — it takes an optional
`onSettled` callback and clears the session on success *or* failure, so an admin who can't reach the
server still ends up logged out locally. The only logout affordance in the app today is a
`DropdownMenuItem` inside `TopBar`, wired by `AppShell.tsx:69,104`. Since `ADMIN-1` put `/admin`
outside `AppShell` on purpose ("admin is not part of the member-facing app chrome, so no TopBar and
no NavTabs"), an admin currently has to edit the URL bar to get out. Reuse the hook as-is; do not
fork it or add a second logout path.

**This is session control, not member chrome — say so in the code.** `ADMIN-1`'s exclusion of
`AppShell` was deliberate, so adding a header control needs a one-line comment explaining why logout
is not a re-import of the chrome that was excluded. Otherwise the next reader sees drift.

**The unsaved-changes guard is the real work, and `useBlocker` is the wrong tool for it.** Both admin
forms already track dirty state locally — `AttributeSchemaEditor.tsx:67` (`text !== toText(schema)`)
and `SportFieldsForm.tsx:47` (`Object.keys(payload).length > 0`) — but neither is wired to anything,
so `/admin` has no unsaved-changes protection today and any navigation silently discards edits.
GRP-2's `useSettingsUnsavedGuard` is the precedent to follow, but note it has **two** mechanisms:
`useBlocker` for route navigation, and a `guard(action)` wrapper for in-page actions. **Logout needs
`guard()`, not `useBlocker`** — logout is an action that *then* navigates, so a blocker would only
fire on the `navigate('/login')` inside `onSettled`, by which point the POST has already been sent
and the session already cleared. Blocking there would leave the user logged out server-side and
still sitting on the page.

**Two structural problems to solve at pickup, both real:**

1. **Dirty state has to travel from a child route to its parent.** The forms live under
   `AdminSportsPage`; the logout button lives in `AdminLayout`, which is the parent route connected
   by `<Outlet/>`. Props cannot flow upward across that boundary. Candidates: `<Outlet context={...}/>`
   passing a `setHasUnsavedChanges` callback down (targeted, no global state), or a small Zustand
   store (matches `client/CLAUDE.md`'s "Zustand owns client/UI state" and the per-page
   `homeFeedStore`/`groupsPageStore` precedent, but makes quite local state global). Not decided here.
2. **GRP-2's dialog offers Discard *and* Save, which is ambiguous when two independent forms can be
   dirty at once** — the schema editor and the sport-fields form have separate Save buttons hitting
   different endpoints. Decide whether the dialog is Discard-only for this surface, or whether Save
   means "save both", and say which in the implementation summary.

**Edge cases:** a failing or offline logout request still logs the user out locally (inherited from
`useLogout`'s `onSettled`, no extra work). The button must reflect `isPending` so a double-click
can't fire two POSTs. Logging out from a deep-linked `/admin/sports/:sportId` must behave identically
to logging out from `/admin`. No account-lifecycle concern applies: this adds no new endpoint and no
new authenticated call — it reuses `POST /auth/logout`, which `AUTH-4`/`A3` already own.

**Out of scope:**

- **A "back to app" link** returning the admin to `/` with their session intact. Different
  destination, different intent (stay logged in), and `/admin` is missing it too — but it's a
  separate ticket, not filed yet.
- TopBar, NavTabs, or any other `AppShell` chrome in `/admin` — `ADMIN-1`'s exclusion stands.
- Any change to `useLogout`, `POST /auth/logout`, or the auth store.
- The `beforeunload` half of GRP-2's guard (browser close/refresh). In scope only if it falls out
  naturally from reusing the hook shape; not a requirement here.
- Session-expiry / 401 handling, which `AUTH-5`'s interceptor already owns.

**Tests:** a Vitest/RTL test that renders `AdminLayout`, clicks Log out, and asserts `POST
/auth/logout` fired and the session was cleared; one asserting the control is present on a nested
admin route, not just `/admin`; and a guard test that makes a form dirty, clicks Log out, asserts the
confirm dialog appears and **no** request fired, then asserts Discard proceeds with the logout. A
Storybook story for `AdminLayout` with the header control. Extend `e2e/flows/admin-route-guard.spec.ts`
or `admin-sports.spec.ts` with a logout-from-admin case — that suite already owns the app's only
authorization coverage.
