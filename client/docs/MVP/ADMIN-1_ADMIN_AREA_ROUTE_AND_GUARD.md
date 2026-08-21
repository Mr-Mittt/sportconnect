# ADMIN-1 · `/admin` area — route, role guard, and shell

**Status:** `DONE` · **Type:** Feature (routing/infra) · **Filed:** 2026-08-20 ·
**Depends on:** nothing · **Blocks:** `ADMIN-2` ·
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` (the first thing `/admin` will host)

## Why a separate ticket

The app has **no admin surface at all** today — every `hasRole('ADMIN')` endpoint on the backend
(sport create/update/delete, location admin writes, and now `A9`'s schema `PUT`) is reachable only
by hand-crafted requests. `ADMIN-2` needs somewhere to live, and "where do admin pages go and who
can see them" is a routing/auth decision that outlives any single admin page. Splitting it keeps
`ADMIN-2` about the schema editor rather than about routing.

## The guard is nearly free — don't rebuild it

`ProtectedRoute` **already takes a `requiredRole` prop** and already implements exactly the needed
behaviour: waits for `authStore.isBootstrapping`, redirects to `/login` with the attempted path when
there's no user, and redirects to `/` when `requiredRole` is missing from `user.roles`. Its own doc
comment notes "no route uses requiredRole yet" — this ticket is that first use.

`User.roles` is `string[]` and the backend stores roles **unprefixed** (`'ADMIN'`, not
`'ROLE_ADMIN'` — `JwtAuthenticationFilter` adds the `ROLE_` prefix on the server side for Spring's
benefit only). So the guard is:

```tsx
<Route
  path="/admin"
  element={
    <ProtectedRoute requiredRole="ADMIN">
      <AdminLayout />
    </ProtectedRoute>
  }
>
  {/* ADMIN-2 adds its child route here */}
</Route>
```

Do **not** write a new `AdminRoute` component. If anything about `requiredRole` turns out to be
wrong, fix `ProtectedRoute`.

## What ships

- **Route** — `/admin` added to `router.tsx`'s tree, guarded as above.
- **`AdminLayout`** — a deliberately plain shell: a heading, a nav slot for future admin sections,
  and an `<Outlet />`. It sits **outside** `AppShell` (no TopBar/NavTabs) — admin is not part of the
  member-facing app chrome. Landing on `/admin` with no child route renders a minimal index listing
  the available sections (just "Sport attribute schemas" once `ADMIN-2` lands).
- **No nav entry.** `/admin` is not linked from anywhere in the member-facing UI in this ticket —
  an admin types the URL. Adding a conditional nav item is a later call, and keeping it unlinked
  avoids leaking the area's existence into every non-admin's DOM.

## Decision to confirm at pickup

**A non-admin currently gets silently redirected to `/`** (that is `ProtectedRoute`'s existing
behaviour, and its comment notes "no dedicated 'unauthorized' page exists"). That's acceptable for
an unlinked URL — arguably better than confirming the area exists. Flagged rather than changed:
building a 403 page is out of scope here, but if one is wanted it should be a `ProtectedRoute`-level
change serving every future role-gated route, not something `/admin` does for itself.

## Explicitly out of scope

Any actual admin functionality — that's `ADMIN-2` and whatever follows it. This ticket is the empty
room, and is verifiable on its own: an ADMIN user reaches `/admin`, a normal user doesn't, a logged-
out visitor gets the login redirect with bounce-back.

## Tests

- Vitest/RTL against `createMemoryRouter(routes, { initialEntries: ['/admin'] })` — the `routes`
  export exists precisely so tests build their own router instead of duplicating the tree. Cases:
  ADMIN user renders `AdminLayout`; `roles: ['USER']` redirects to `/`; no user redirects to
  `/login` carrying `state.from`; `isBootstrapping` shows the loading state rather than deciding
  early.
- Storybook: `AdminLayout` with and without a child route.

## Implementation summary (`DONE`, 2026-08-21)

### The approved plan (Phase 3)

Add a `/admin` route to `src/router.tsx` guarded by the **existing** `ProtectedRoute requiredRole="ADMIN"`
— no new guard component — rendering a plain `AdminLayout` shell outside `AppShell`, with an
`AdminIndex` child for the index route. No types, no data hook (nothing is fetched), no Zustand
state, no nav entry. Tests: four RTL routing cases through the real exported `routes`, plus two
Storybook stories.

Two decisions confirmed at pickup, both as the ticket proposed: **keep the silent redirect** for a
non-admin (a 403 page would be a `ProtectedRoute`-level change serving every future role-gated route,
not something `/admin` invents for itself), and **render an index empty state** rather than a bare
outlet, since a blank panel is indistinguishable from a broken route.

**One expansion beyond the ticket's stated test plan**, decided during pickup: the ticket listed only
RTL + Storybook, but the suite had **zero** authorization coverage anywhere — every existing spec logs
in as `mockUser` with `roles: ['USER']`, and no route had ever used `requiredRole`, so
`ProtectedRoute`'s role branch had never executed in a browser. An E2E spec covering both roles was
added. See *Why the E2E spec earns its place* below.

### What was built

| File | Change |
|---|---|
| `src/features/admin/AdminLayout.tsx` | New. Heading, an empty `<nav>` slot, and `<Outlet />`. |
| `src/features/admin/AdminIndex.tsx` | New. Index content — heading plus an explicit empty state. |
| `src/router.tsx` | `/admin` route, guarded, outside the `AppShell` group but inside `RootLayout`. |
| `src/features/admin/AdminLayout.test.tsx` | New. 6 RTL cases through the real `routes`. |
| `src/features/admin/AdminLayout.stories.tsx` | New. 2 stories. |
| `e2e/flows/admin-route-guard.spec.ts` | New. 2 browser cases. |
| `e2e/mocks/fixtures.ts` | `mockAdminUser` + `mockAdminRefreshToken`. |
| `e2e/mocks/handlers/auth.ts` | Login accepts either account; refresh resolves the user from the cookie. |
| `client/docs/E2E_OVERVIEW.md` | §3 directory listing, §5 fixtures, §6 catalog entry. |

### Key decisions

- **`ProtectedRoute` was reused untouched.** It already implemented `requiredRole` exactly as needed
  and its own comment noted "no route uses requiredRole yet" — this is that first use. No line of it
  changed.
- **`requiredRole="ADMIN"`, not `"ROLE_ADMIN"`.** The backend stores roles unprefixed;
  `JwtAuthenticationFilter` adds the `ROLE_` prefix server-side for Spring's benefit only. Verified
  against `src/features/auth/types.ts` (`roles: string[]`) and every existing fixture.
- **`/admin` sits outside `AppShell` but inside `RootLayout`.** Outside `AppShell` so admin gets no
  TopBar/NavTabs — it is not member-facing chrome. Inside `RootLayout` because that is where
  `useSessionBootstrap` runs; a route outside it would leave an admin hard-refreshing on `/admin`
  bounced to `/login` before the refresh-cookie check resolved.
- **`AdminIndex` is its own component, not inlined in the layout**, so ADMIN-2 adds its section link
  by editing one small file rather than the shell.

### Non-obvious constraints

- **A guard is not access control.** `AdminLayout`'s doc comment says so explicitly. Every admin
  endpoint enforces `hasRole('ADMIN')` server-side independently (sport A9 verified this end to end),
  so this guard hiding UI is the whole of its job. It is also cosmetic with respect to account
  lifecycle: a deactivated admin still passes it until their token expires — the standing U12 gap,
  inherited here, not introduced.
- **The ticket's file path was slightly wrong.** It refers to `router.tsx` as if under `src/app/`; the
  file is `src/router.tsx`. Noted as a Delta below.

### Divergence during implementation: the RTL tests needed a `QueryClientProvider`

The first version of `AdminLayout.test.tsx` rendered `routes` directly and all 6 cases failed — not on
any guard assertion, but with `No QueryClient set`. Rendering the real route tree includes
`RootLayout`, which calls `useSessionBootstrap()` → `useMutation` on mount. Fixed by matching
`App.test.tsx`'s established `renderApp` pattern exactly: wrap in `QueryClientProvider`, and
`vi.spyOn(apiClient, 'post').mockRejectedValue(...)` so the bootstrap refresh resolves to "no session"
instead of reaching the network.

This is the cost of the deliberate choice to test through the **real** `routes` export rather than a
hand-built tree. Worth it: a local tree would prove `ProtectedRoute` works in isolation while saying
nothing about whether `/admin` is actually nested under it — which is the mistake most likely to be
made in a routing ticket.

### Why the E2E spec earns its place

The existing suite covers *authentication* redirects well — `auth-journey.spec.ts` step 7 deep-links
to `/friends` while logged out and asserts the `/login` bounce-back. It covers *authorization* nowhere.
That asymmetry is the same shape as the backend gap found the day before during sport A9: denial paths
that were role-based had no test anywhere, and a real bug (every `@PreAuthorize` denial returning 500
instead of 403) hid in exactly that blind spot for months.

**A second refresh-token fixture was required, and the reason is not incidental.** `/api/auth/refresh`
returned a single fixed `authResult` — always `mockUser`. Because `page.goto('/admin')` is a full app
mount, the bootstrap refresh runs on arrival; with one shared token the admin would have been
re-identified as a plain `USER` and redirected, failing the test for a reason having nothing to do with
the guard. The handler now resolves the account from the refresh cookie, which is also closer to how a
real session identifies itself. Existing specs are unaffected: `mockUser`'s token, response shape, and
login path are byte-for-byte unchanged.

### Not done, deliberately

No admin functionality (ADMIN-2), no 403/unauthorized page, no conditional nav entry, no visual-
regression spec (the shell has no approved `design-reference-*.html` to diff against, and inventing one
for a heading and an outlet would be make-work).

### Delta for the next ticket

- **The router file is `src/router.tsx`**, not `src/app/router.tsx` as ADMIN-1's prose implied.
- **ADMIN-2's blocker is cleared.** Its backlog title still reads "hard-blocked on backend A9"; A9
  merged 2026-08-20 (PR #176), and this ticket clears the ADMIN-1 dependency. Its child route slots
  into the existing `<Route path="/admin">` block, and its section link replaces `AdminIndex`'s empty
  state.
- **`GET /api/sports/{sportId}/attribute-schema` is gated `isAuthenticated()`, not `hasRole('USER')`**
  — deliberately, so an ADMIN-only account can read it. ADMIN-2 consumes that endpoint.

### Verification

| Check | Result |
|---|---|
| `pnpm exec tsc -b` | pass |
| `pnpm lint` | 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`, untouched) |
| `pnpm test` (Vitest) | **130 files, 897 tests, all pass** |
| `playwright --project=e2e admin-route-guard.spec.ts` | **2/2 pass** |
| `playwright --project=e2e` (full suite) | **53/53 pass** — includes the 4 `msw-setup.spec.ts` cases that exercise login/refresh/401 directly, which is what the handler change touched |

**Backend contract confirmed by reading the source rather than assuming:** `UserResponse.roles` is a
`Set<String>` (`user-api`), populated in `UserServiceImpl:382-384` by mapping `role.getName()` — so
the wire shape is `["USER","ADMIN"]`, unprefixed. That is exactly what `user.roles.includes('ADMIN')`
needs, and it is the one link MSW cannot prove, since MSW returns whatever the fixture says.

**Not done — the manual browser walk.** Phase 5 asks for the happy path in a running browser. The
Chrome extension was not connected in this session, so it could not be driven; port 8080 was also
already held by an unrelated server, so a fresh `bootRun` was not started. The E2E spec covers the
same journey in a real browser (against MSW), and the DTO check above covers the real backend's role
shape, so the residual gap is narrow: nobody has *looked* at the rendered `/admin` page. Worth one
manual pass before merge — log in as an ADMIN account, visit `/admin`, confirm the shell renders and
that a non-admin account is bounced to `/`.

**Dev-environment note:** `admin@admin.admin` in `sportconnect_dev` was granted `ADMIN` during this
ticket (it already held `USER`; the row was added directly to `user_roles`, since no code path grants
ADMIN). Roles are baked into the JWT at login, so an existing session must log out and back in before
the new role takes effect.
