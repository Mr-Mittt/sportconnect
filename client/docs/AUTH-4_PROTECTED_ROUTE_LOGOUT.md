# AUTH-4 — ProtectedRoute + logout

**Status:** DONE (2026-07-10)
**Spec:** `client/docs/sporthub-auth-feed-integration-tickets.md` § AUTH-4. Not blocked — auth
backlog A3 (BE-2, logout authorization fix) shipped 2026-07-08.

## Context

Route guard for authenticated-only pages, and the logout action. Per the backlog's delta:
`POST /api/auth/logout` takes no query param — the caller is derived from the `Authorization:
Bearer` header (see A3). Component API per the epic: `{ children: ReactNode; requiredRole?: string }`.

No mockup exists for a logout entry point or an "unauthorized" destination. Both were resolved with
the user before building:

1. **Logout trigger**: an avatar dropdown menu (not a direct click-to-logout on the avatar), shown
   as an HTML mockup pitch built from SportHub's real design tokens before implementation — approved
   as the direction, not frozen as a `design-reference-*.html`/visual-regression baseline (too small
   a UI addition to the *existing* TopBar to warrant that machinery; verified via Storybook instead,
   matching how every other component in this backlog was verified).
2. **Unauthorized destination** (`requiredRole` mismatch): redirect to Home Feed (`/`) — no dedicated
   page, since no route uses `requiredRole` yet.
3. **Redirect-back after login**: applies to both Login **and** Register (epic text only mentioned
   Login; register also auto-logs-in, so the user asked for parity).

## What was built

### `ProtectedRoute.tsx` (new, `src/shared/components/`)

Same location as `AppShell` — a routing/shell concern, not a page. While
`authStore.isBootstrapping` is true, renders a loading state (no design exists for this; kept plain
text). No `user` after bootstrap resolves → `<Navigate to="/login" state={{ from: location.pathname
+ location.search }} replace />`. `requiredRole` given and missing from `user.roles` → redirect to
`/`. Otherwise renders `children`.

### `useLogout.ts` (new, `src/features/auth/`)

`useMutation` wrapping `POST /auth/logout` (no body, no query param — the real A3 contract; Bearer
header auto-attached by the existing `attachAuthHeader` interceptor). `onSettled` (success **or**
failure) calls `authStore.clearSession()` — matches "logout clears the session even if the network
call fails."

### `DropdownMenu` primitive (new, `src/shared/ui/dropdown-menu.tsx`)

Hand-written wrapper around `@radix-ui/react-dropdown-menu` (new dependency), restyled to tokens —
same reasoning as `Avatar`'s use of Radix: focus trapping, roving keyboard nav, outside-click
dismissal aren't hand-rolled. New `--shadow-menu` token added to `index.css` via `@utility` (same
pattern as the existing `shadow-card`), sized for a ~240px menu rather than the big login card.

### `TopBar.tsx` — API change

`userInitials: string` + `onAvatarClick` → `user: { initials, name, email }` + `onLogout: () =>
void`. Internally renders the dropdown per the approved mockup: chevron + avatar trigger → identity
header (avatar, name, email) → separator → "Log out" item. `search`/`notifications` callbacks
unchanged.

### Page/state wiring

- `App.tsx` — the `<Route element={<AppShell />}>` layout route now wraps `AppShell` in
  `ProtectedRoute`.
- `AppShell.tsx` — reads `authStore.user` (guaranteed non-null once it renders, since
  `ProtectedRoute` already gated it), computes initials from `firstName`/`lastName`, wires
  `useLogout()` + `useNavigate()` → `/login` on settle. This also closes AUTH-0's flagged gap
  ("TopBar is still not wired to the real user") for name/email/initials — `avatarUrl` image
  rendering (vs. initials fallback) remains out of scope.
- `LoginPage.tsx` and `RegisterPage.tsx` — read `location.state?.from` via `useLocation()`, navigate
  there instead of the hardcoded `/`.

### `PublicOnlyRoute.tsx` (new, `src/shared/components/`) — added after initial review

Not in the original epic text, added after the user asked what happens if an already-authenticated
visitor navigates to `/login`/`/register` directly (stale bookmark, browser back, etc.) — the answer,
before this addition, was "nothing: the form just renders again, unguarded." `PublicOnlyRoute` is the
inverse of `ProtectedRoute`: same `isBootstrapping` wait (to avoid flashing the form for a user who
actually has a valid session), then redirects an authenticated visitor to `/` instead of rendering
`children`. Wraps both `/login` and `/register` in `App.tsx`.

New shared `AuthLoadingState.tsx` extracted (used by both `ProtectedRoute` and `PublicOnlyRoute` —
identical "waiting on bootstrap" JSX, not worth duplicating twice).

**A second race, found and fixed the same way as the E2E one below:** `PublicOnlyRoute` reactively
redirects whenever `authStore.user` becomes truthy — but so does a *successful login completed on the
page it wraps*. `useLogin`'s `onSuccess` calls `setSession()` (making `user` truthy) and then
`navigate(from)` in the same synchronous callback; `PublicOnlyRoute`'s own Zustand subscription reacts
to that same `setSession()` call and wants to redirect to `/` too. Confirmed empirically (not assumed)
via the existing `App.test.tsx` redirect-back integration test, which started failing — landing on
Home Feed instead of the originally-attempted route — the instant `PublicOnlyRoute` was wired in.
Fixed by making the redirect decision **once**, via a `useRef` (same pattern as
`useSessionBootstrap`'s StrictMode guard): `PublicOnlyRoute` decides `redirect` vs `render` the first
time `isBootstrapping` resolves, and never reconsiders — a login completed inside its own `children`
is the child page's `navigate()` to handle, not this guard's to race against.

## A real, unrelated regression found and fixed: four existing E2E specs broke

`ProtectedRoute` wrapping `AppShell` means every route under it — including Home Feed — now requires
authentication. Four pre-existing, previously-green E2E specs assumed unauthenticated access to `/`
and broke: `a11y.spec.ts`, `smoke.spec.ts`, `home-feed-journey.spec.ts`, and the visual-regression
spec `app-home-feed.spec.ts`. None of these can hit a real backend (CI never starts the Spring Boot
server), so the fix had to go through MSW.

**`seedAuthenticatedSession(page, targetPath?)`** (new, `e2e/mocks/fixtures.ts`) — the shared fix.
Two dead ends before landing on the working design, both confirmed empirically rather than assumed:

1. `context.addCookies()` (inject the refresh cookie directly into Playwright's browser context) —
   **invisible to MSW**. MSW's browser-mode `cookies` resolver arg doesn't read the real browser
   cookie jar; it reads its own private, `localStorage`-backed shadow store
   (`msw/lib/core/utils/cookieStore.mjs`), populated only by `Set-Cookie` headers passing through
   MSW's *own* mocked responses. Traced this by reading MSW's source after the cookie showed up
   correctly in `context.cookies()` but MSW's refresh handler still reported "Refresh token missing."
2. A raw `fetch('/api/auth/login')` via `page.evaluate` — correctly populates MSW's store, but a
   *subsequent* `page.goto()` still races AUTH-3's automatic bootstrap effect against MSW's
   per-navigation worker-ready handshake (`test.ts`'s `addInitScript` re-runs `worker.start()` on
   every navigation). Confirmed empirically: reliable run alone, ~80% failure rate run under
   Playwright's default parallel workers.

**Working design**: go to the real `targetPath` first, while logged out. `ProtectedRoute` redirects
to `/login` carrying `targetPath` as the `from` state — deterministic regardless of whether *that*
first navigation's own (expected-to-fail) bootstrap call actually got intercepted by MSW or fell
through entirely, since both outcomes mean "not logged in" and are handled identically. Then drive
the real login form: `useLogin`'s `onSuccess` calls `authStore.setSession()` directly in memory, and
the resulting redirect is an in-app `navigate()`, not a reload — no second bootstrap fetch, no second
race. Verified reliable across repeated runs under full parallel worker load (21/21, then 14/14 on
the full suite).

**Applied to all four specs** (`import { seedAuthenticatedSession } from '../mocks/fixtures.ts'` +
`import { expect, test } from '../mocks/test.ts'` replacing the bare `@playwright/test` import).
Along the way, fixed a real ambiguity the new SPA-transition flow exposed: `getByText('SportHub')`
(substring match) now also matches `LoginForm`'s "New to SportHub? Create an account" text, which
can transiently coexist during the login→Home-Feed transition — changed to `{ exact: true }` in
`smoke.spec.ts`/`home-feed-journey.spec.ts`.

## Home Feed's 9 committed visual-regression baselines are now stale

`app-home-feed.spec.ts` executes correctly with the new auth flow (all navigation/state-reaching
mechanics work), but every screenshot now legitimately diffs against the old baselines — TopBar's
markup changed (chevron + avatar-menu wiring visible in every capture, since TopBar renders on every
page). Same situation as HF-13 (AUTH-1's `cn()` fix). **Not fixed here** — baselines are
Linux-rendered via CI's `update-baselines` dispatch (per HF-12), and local Windows regeneration would
introduce OS-mismatch noise. Filed as **HF-14** in the backlog, same process as HF-13.

## Explicitly out of scope

- 401 refresh-retry interceptor (AUTH-5) — separate ticket.
- `avatarUrl` image rendering in the account menu/TopBar (still initials-only) — not part of this
  ticket's scope, same flagged gap as AUTH-0.
- HF-14 (baseline regen) — filed, not executed here.

## Verification

- `pnpm exec tsc -b` / `pnpm lint` — clean.
- `pnpm test` — 115/115 (95 pre-AUTH-4 + 15 from the initial AUTH-4 build + 5 new `PublicOnlyRoute`
  cases; also fixed the 2 original `/login`/`/register` `App.test.tsx` cases, which needed
  `await waitFor(...)` once those routes started going through `PublicOnlyRoute`'s async
  `isBootstrapping` check). Full suite re-run 3× clean to confirm the ref-guard fix actually resolved
  the race rather than masking it.
- `pnpm build` / `pnpm build-storybook` — clean.
- `pnpm exec playwright test --project=e2e` — 13/13 after the `PublicOnlyRoute` addition (one fewer
  than before since the throwaway verification spec from the first pass had already been deleted).
- **Real backend verification** (`./gradlew :server:bootRun`, dev profile, real Postgres/Redis),
  driven via throwaway Playwright scripts (deleted after use):
  - First pass: direct nav to `/groups` while logged out → `/login`; register → lands on Home Feed
    (no redirect-back state on that hop, confirmed as expected — the "Create an account" link is a
    plain `<Link>`, not a state-carrying redirect); logout via the avatar menu → session cleared,
    redirected to `/login`; direct nav to `/groups` again → log in → redirect-back lands on
    `/groups`, not Home Feed; Escape closes the account menu via keyboard without triggering logout.
  - Second pass (`PublicOnlyRoute`): register → already authenticated → manually navigating to
    `/login` redirects straight to Home Feed without showing the form; same for `/register`; logout
    → `/login` reachable normally again.
