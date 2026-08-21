# ADMIN-4 · Log out from the admin area

**Status:** `DONE` (2026-08-21) · **Type:** Enhancement · **Depends on:** none (`AUTH-4` and `ADMIN-1` both `DONE`) ·
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

---

## What was built

### The approved design

Two pickup decisions were taken before any code (both user calls, both recorded here because the
ticket left them open):

1. **Dirty state travels by outlet context**, not a Zustand store. The forms live under
   `AdminSportsPage`; the Log out button lives in `AdminLayout`, its parent route across an
   `<Outlet />`, and props cannot flow upward. Outlet context is targeted to the admin tree and adds
   no global state for something this local. The Zustand alternative matched `client/CLAUDE.md`'s
   "Zustand owns client/UI state" and the `homeFeedStore`/`groupsPageStore` precedent, but made
   page-local state global to win an argument nobody was having.
2. **The dialog is Discard-only.** GRP-2's offers Discard *and* Save; here two independent forms can
   be dirty at once, each with its own Save button and its own endpoint, so a single "Save" would
   have to fire both mutations and then decide what to do when one of them fails — a partial-failure
   case GRP-2 never had to solve. Cancel + "Discard & log out" sidesteps it: the admin can cancel and
   save whichever form they actually meant.

### Files

| File | Change |
|---|---|
| `src/features/admin/useAdminOutletContext.ts` | **New.** `AdminOutletContext` type + typed accessor. |
| `src/features/admin/components/AdminUnsavedChangesDialog.tsx` | **New.** Discard-only confirm dialog. |
| `src/features/admin/components/AdminUnsavedChangesDialog.test.tsx` | **New.** 5 tests. |
| `src/features/admin/AdminLayout.tsx` | Header Log out button, dialog, outlet context, `useLogout` wiring. |
| `src/features/admin/AdminSportsPage.tsx` | Combines both forms' dirty flags, reports upward. |
| `src/features/admin/components/SportFieldsForm.tsx` | New optional `onDirtyChange` prop. |
| `src/features/admin/components/AttributeSchemaEditor.tsx` | New optional `onDirtyChange` prop. |
| `src/features/admin/AdminLayout.test.tsx` | New `describe` block, 6 tests. |
| `src/features/admin/AdminLayout.stories.tsx` | `QueryClientProvider` wrapper + `UnsavedChangesOnLogout` story. |
| `e2e/flows/admin-route-guard.spec.ts` | 2 new tests (plain logout, nested route). |
| `e2e/flows/admin-sports.spec.ts` | 2 new tests (guard warns/cancels/discards, clean form doesn't prompt). |
| `docs/E2E_OVERVIEW.md` | §3 listing + §6 tables updated for both spec files. |

`useLogout`, `POST /auth/logout` and the auth store are **untouched** — the mechanism already existed
and nothing about it was TopBar-specific.

### Key decisions

**`guard(action)`, never `useBlocker`.** GRP-2's `useSettingsUnsavedGuard` has two mechanisms and
only one of them is right here. `useBlocker` intercepts *navigation*; logout is an *action* that
POSTs first and only navigates inside `useLogout`'s `onSettled`. A blocker would therefore fire after
the session had already been cleared server-side, stranding a logged-out admin on the page. The
button checks `hasUnsavedChanges` itself and opens the dialog instead of calling `logout()`.

**`onDirtyChange` is optional on both forms.** Existing callers — ADMIN-2's stories and its
`AdminSportsPage.test.tsx` — need no change, which is what kept ADMIN-2's 16 tests passing verbatim.

**Both the forms and the page report clean on unmount.** Each `useEffect` returns a cleanup that
reports `false`. `AdminLayout` outlives its child routes, so a `true` left behind by an unmounted
section would keep prompting on every later logout attempt — including from a section with no forms
at all.

**`useAdminOutletContext` falls back to a no-op when there is no context.** ADMIN-2's
`AdminSportsPage.test.tsx` mounts the page standalone, where `useOutletContext()` returns `null` and
destructuring it would throw — that alone would have broken 10 existing tests. The obvious risk is
that a mis-nested route then silently disables the guard rather than failing loudly; that is covered
by `AdminLayout.test.tsx` exercising the guard through the **real** `routes` tree, where the nesting
is genuine.

### Divergences from the approved design

One, in the tests rather than the product. The plan called for asserting "no request fired" with
`expect(postSpy).not.toHaveBeenCalled()`. That is wrong twice over: `RootLayout`'s
`useSessionBootstrap` POSTs `/auth/refresh` on every mount, so the spy is never empty; and
`vi.spyOn` on an already-spied method returns the *existing* spy rather than re-wrapping, so call
history survives into later tests in the file. The first run failed on both counts and the failure
initially looked like a product bug — a standalone reproduction confirmed the dialog opens and no
logout fires, so the defect was in the assertion. Fixed by filtering to `/auth/logout` calls and
clearing the spy immediately before the click under test.

### Non-obvious constraints

- **Storybook now needs a query client for `AdminLayout`.** `useLogout` is a `useMutation`, so the
  layout does not render at all without a `QueryClientProvider` in the tree. Its stories build their
  own router already; they now build their own query client too.
- **The `AttributeSchemaEditor` effect sits above the loading-state early return.** `isDirty` moved
  up with it — hooks cannot be declared after a conditional `return`.
- **This guards logout only.** In-app navigation away from a dirty admin form still discards
  silently. That gap is pre-existing (`/admin` never had any unsaved-changes protection), broader
  than logout, and deliberately out of scope — see below.

## Verification

| Check | Result |
|---|---|
| `pnpm exec tsc -b` | Pass |
| `pnpm lint` | Pass — 0 errors. The 2 warnings are pre-existing in `SessionStartTimePicker`, untouched here. |
| `pnpm test` | **918 passed / 132 files.** Includes ADMIN-1 + ADMIN-2's 16 tests passing **unchanged**. |
| `pnpm e2e` | **61 passed**, including the 4 new admin cases. |

**Not done, deliberately:** no run against a live backend. This ticket adds no endpoint and changes
no contract — it reuses `POST /auth/logout`, already shipped and verified by AUTH-4/A3 — so there is
nothing new for a real backend to disagree about. **Not done, and worth noting as a gap:** the new
Storybook story was type-checked but not visually reviewed, the same gap session 077 recorded for
ADMIN-2's stories.

## Deltas for later tickets

- **`SportFieldsForm` and `AttributeSchemaEditor` now expose `onDirtyChange`.** Any future consumer
  wanting dirty state has a supported way to get it and should not re-derive it by comparing props.
- **`AdminLayout` provides outlet context.** A new admin section that owns unsaved edits should call
  `useAdminOutletContext().setHasUnsavedChanges(...)` and report `false` on unmount — it gets the
  logout guard for free, no change to `AdminLayout`.
- **Still unfiled, both surfaced by this ticket:** a "back to app" link returning an admin to `/`
  with their session intact, and a general unsaved-changes guard for `/admin` navigation (the
  pre-existing gap this ticket only half-closes, on the logout path).
