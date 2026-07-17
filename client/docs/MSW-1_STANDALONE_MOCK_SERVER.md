# MSW-1 · Standalone mock server for e2e

**Status:** `DONE` (2026-07-17) · **Type:** Infrastructure (Testing) · **Origin:** discovered during
AUTH-8 — a genuine, reproducible race between MSW's per-navigation Service Worker setup and the app's
own bootstrap fetch.

## Problem recap

`e2e/mocks/test.ts` re-ran the full `setupWorker()` → `worker.start()` handshake (~150–300ms) via
`page.addInitScript` on every navigation, including `page.reload()`. `App.tsx`'s
`useSessionBootstrap()` fires a real `POST /api/auth/refresh` as soon as React mounts, and Vite's
module cache made the app mount faster on each repeat navigation while the Service Worker handshake
cost stayed flat — by the 4th–5th navigation in one test, the app reliably won the race and the
request fell through to the real network instead of being intercepted. AUTH-8's step 5
("reload while logged in — still authenticated") couldn't be tested and was skipped. Full
investigation: `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md`.

## Approved plan (Phase 3, restated)

Replace the browser Service Worker with a standalone Node HTTP server (Version A from the backlog
entry), started once via Playwright's `webServer` array and already listening before any test
begins — no per-navigation setup handshake left to race. Three decisions confirmed with the user
before implementation:

1. **Server approach: Option (a)** — a thin adapter over the *existing* `e2e/mocks/handlers/*.ts`
   array, not a hand-written duplicate server.
2. **Introspection: a dedicated request log** (`GET /__mock/sessions/:id/requests`), not a response
   header marker — replaces `response.fromServiceWorker()`'s old "prove this didn't hit the real
   network" role.
3. **Full scope**: migrate the specs using `fromServiceWorker()`, and restore AUTH-8's skipped step 5
   (reload-persistence), not just the server/wiring.

## A design gap surfaced mid-Phase-2, resolved with the user

The ticket's own text didn't account for `feed.ts`/`groups.ts`/`sport.ts` holding **module-level
mutable state** (`postsState`, `userGroupsState`, etc.). That was previously safe only because each
Playwright page got a fresh Service Worker module instance via the same `addInitScript` re-import this
ticket removes — a side effect of the exact mechanism being replaced. A single shared server process
(`fullyParallel: true`, 8 workers observed) would otherwise let concurrently-running tests corrupt each
other's state.

**Resolved (user-approved): one shared server process, state keyed by a per-test session id** carried
via an `x-e2e-session-id` header the test's browser context sets before any navigation
(`context.setExtraHTTPHeaders`, in `test.ts`). Every stateful handler resolves its working data through
`sessionStore.ts`'s `Map<sessionId, T>` instead of a bare `let`. Rejected alternatives: one mock-server
process per Playwright worker (needs Vite's proxy to dynamically route per-request — more moving parts
for no real benefit over header-based partitioning); forcing `workers: 1` (real speed regression, and
still would have needed a reset-between-tests mechanism regardless, so it wouldn't have even simplified
anything).

## What was built

- **`e2e/mocks/mockServerConfig.ts`** — single source of truth for the server's port/URL and the
  session-header name, imported by the server, Playwright config, and test-side code.
- **`e2e/mocks/sessionStore.ts`** — generic `createSessionStore<T>()` (a lazily-initialized
  `Map<sessionId, T>`) and `sessionIdFromRequest()`.
- **`e2e/mocks/overrides.ts`** — replaces the 6 retired override modules (`apiErrors.ts`,
  `emptyFeed.ts`, `expireSession.ts`, `emptySportProfiles.ts`, `failCreatePostOnce.ts`, and
  `paginatedFeed.ts`'s override half) with one flat `SessionOverrides` flag set per session, checked
  first by the real handlers before falling through to normal logic — same effective precedence
  `worker.use()` used to give a runtime-registered handler.
- **`e2e/mocks/mockServer.ts`** — the actual Node server. Converts each incoming `IncomingMessage` to a
  Fetch `Request`, dispatches through **`getResponse(handlers, request, { baseUrl })`** — msw's own
  exported matching/resolution utility (`msw` core, no new dependency) — and writes the resulting
  `Response` back, using `Response.headers.getSetCookie()` to correctly emit multiple `Set-Cookie`
  headers (a single comma-joined header is invalid for cookies specifically). Also serves the
  `/__mock/*` admin API: `health`, `sessions/:id/reset`, `sessions/:id/requests`,
  `sessions/:id/seed-paginated-feed`, `sessions/:id/override/:name`.
- **`e2e/mocks/handlers/{auth,feed,groups,sport}.ts`** — refactored from module-level `let` state to
  `createSessionStore`-backed state, with override-flag checks added to every endpoint that used to
  have a `worker.use()` override (feed error/empty, trending error, broadcasts error, groups error,
  refresh-expired, sport-profiles-empty, create-post-fail-once). `groups.ts`/`sport.ts`'s existing
  (previously unused) `resetGroupHandlersState`/`resetSportHandlersState` exports finally get a real
  caller.
- **`e2e/mocks/paginatedFeedFixture.ts`** — the pure 21-post fixture-construction logic, moved out of
  the retired `paginatedFeed.ts` (kept separate from `overrides.ts` to avoid a circular import with
  `feed.ts`).
- **`e2e/mocks/test.ts`** — rewritten: no `addInitScript`/Service Worker; generates a unique
  `mockSessionId` per test (`testInfo.testId` + `testInfo.repeatEachIndex`), attaches it via
  `context.setExtraHTTPHeaders` before `page` is created, and resets the session server-side after
  each test.
- **`e2e/mocks/fixtures.ts`** — `simulate*OnNextLoad`/`seed*OnNextLoad` helpers now take a
  `sessionId: string` and make a plain `fetch()` call to the admin API instead of injecting browser JS.
  New `simulateCreatePostFailOnce(sessionId)` (was a direct `window.__mswWorker` call from
  `feed-groups-journey.spec.ts`). `seedAuthenticatedSession`'s doc comment simplified — no more
  Set-Cookie/reload caveats, since both are now genuinely true. **`seedRefreshCookieMirror` removed
  entirely** — it existed solely to work around the exact limitation this ticket fixes (a real
  `Set-Cookie` response is now honored by the browser natively).
- **`playwright.config.ts`** — `webServer` is now an array: the mock server (readiness probe
  `/__mock/health`) plus the existing `pnpm dev`, which gets `VITE_API_PROXY_TARGET` set to the mock
  server's URL only in this Playwright-managed context.
- **`vite.config.ts`** — `/api` proxy target reads `process.env.VITE_API_PROXY_TARGET`, falling back
  to `:8080` — a bare `pnpm dev` outside Playwright is completely unaffected.
- **`msw-setup.spec.ts`** — rewritten to assert against the request log instead of
  `response.fromServiceWorker()` (which stopped being a meaningful question once there's no Service
  Worker to have reached).
- **`auth-journey.spec.ts`** — step 5 restored as its own dedicated test (a fresh login + `page.reload()`
  + still-authenticated assertion) rather than chained onto steps 1–4, since step 4 ends logged out and
  every Playwright test already gets an isolated session for free.
- Retired: `server.ts`, `apiErrors.ts`, `emptyFeed.ts`, `expireSession.ts`, `emptySportProfiles.ts`,
  `failCreatePostOnce.ts`, `paginatedFeed.ts`, `public/mockServiceWorker.js`; `package.json`'s
  `msw.workerDirectory` config (only supported regenerating the now-removed worker file);
  `eslint.config.js`'s matching ignore entry.

## A real bug found and fixed mid-implementation

`e2e/mocks/test.ts`'s `mockSessionId` fixture uses Playwright's standard no-dependency fixture
signature (`async ({}, use, testInfo) => ...`), which trips ESLint's `no-empty-pattern` rule. Fixed
with a targeted `eslint-disable-next-line` (placed immediately before the flagged line, with the
rationale in a separate leading comment — a directive comment followed by more `//` continuation
lines only disables the rule for the *next* comment line, not the code past it, which was the first,
wrong attempt).

## Verification (Phase 5)

- `tsc -b --noEmit`: clean (confirms `e2e/**/*.ts` — covered by `tsconfig.node.json`, no DOM lib —
  typechecks against Node's own global `Request`/`Response`/`Headers`, no new dependency needed;
  `msw`'s `getResponse` is already exported from the `msw` package this project already depends on).
- `eslint .`: clean.
- `pnpm test` (Vitest): 341/341 — unaffected, this ticket only touches `e2e/`.
- `pnpm e2e`: 32/32, including the new reload-persistence test. Re-run at `--repeat-each=3` (96/96) and
  the reload-persistence test alone at `--repeat-each=10` (10/10) — zero flakes, confirming the
  original race is actually gone, not just less likely.
- `pnpm test:visual`: all 9 states report "different" locally — confirmed via direct diff-image
  inspection to be the same pre-existing sub-pixel Windows-vs-Linux font-rendering noise this project
  has documented since HF-12 (CI is the authoritative Linux-rendered environment), not a regression
  from this ticket. Content/layout/data in the actual screenshots are correct.
- Confirmed via direct code inspection that a bare `pnpm dev` (no `VITE_API_PROXY_TARGET` set) falls
  back to `:8080`, unaffected by this change.
- Manually verified the server end-to-end via direct `curl` before wiring it into Playwright: real
  `Set-Cookie` extraction (`getSetCookie()`), the `cookies` resolver arg reading a real `Cookie`
  header, session isolation (two sessions' likes don't cross-contaminate), override flags scoped
  per-session, and the reset endpoint.

## Acceptance criteria (from the backlog entry)

- ✅ A `page.reload()`-based reload-persistence test passes reliably, verified flake-free at
  `--repeat-each=10`.
- ✅ All existing e2e specs still pass under the new mock topology.
- ✅ `AUTH-8`'s auth-journey spec gains its step 5 back.
