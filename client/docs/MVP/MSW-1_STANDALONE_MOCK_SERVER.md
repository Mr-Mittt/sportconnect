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

---

### MSW-1 · Standalone mock server for e2e
**Status:** `DONE` (2026-07-17) · **Summary:** `client/docs/MSW-1_STANDALONE_MOCK_SERVER.md`
**Type:** Infrastructure (Testing)
**Origin:** discovered during AUTH-8 — a genuine, reproducible race between MSW's per-navigation
Service Worker setup and the app's own bootstrap fetch, root-caused with instrumented timing data.
Not fixable by waiting longer or retrying more (see "Why not X" below) — the fix has to change
*how* MSW is wired in, not how long a test waits for it.

**The problem, precisely:** `e2e/mocks/test.ts` re-runs the full `import('/e2e/mocks/server.ts') →
setupWorker() → worker.start()` chain via `page.addInitScript()` on *every* navigation, including
`page.reload()`. That chain takes ~150–300ms (real, measured: Service Worker registration +
activation + a `postMessage` handshake). Meanwhile `App.tsx`'s `useSessionBootstrap()` fires
`POST /api/auth/refresh` as soon as React mounts — and on a `page.reload()` specifically, Vite's
dev-server module cache means the app mounts *faster* on each successive navigation within the same
test, while MSW's setup cost stays roughly flat (Service Worker registration isn't a cacheable HTTP
fetch the way JS modules are). The two curves cross a few navigations in: early on MSW usually wins,
by the 4th–5th real navigation in the same test the app reliably wins and the refresh request falls
through to the real network layer instead of being intercepted.

This is why `AUTH-8`'s step 5 ("reload while logged in — still authenticated") could not be reliably
tested and was skipped rather than shipped flaky — see `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md` for
the full investigation and instrumented timeline.

**Why not X (things that look like fixes but aren't, all tried for AUTH-8):**
- A fixed sleep before checking — the epic's own "no arbitrary waits" rule rules it out anyway, and
  it wouldn't be reliable across machines/CI load regardless.
- A bigger retry budget — makes it *worse*, not better: more retries means more navigations, which
  pushes the app's warm-cache advantage further ahead, not closer. Confirmed empirically: 15 retries
  had a *lower* success rate than 5.
- Gating the `/auth/refresh` request via `page.route()` until MSW is confirmed ready — the request
  never reached MSW's handler at all afterward; CDP-level route interception appears to bypass the
  Service Worker dispatch path once it grabs a request.
- Gating the app's entry module (`/src/main.tsx`) the same way — deadlocked; that also blocked Vite
  dev server's concurrent fetch of the MSW setup module the wait itself depended on.
- A one-time "warm-up" navigation before the real test steps — doesn't help, and plausibly hurts:
  warming up *helps the wrong side* of the race (the app's cache), the same way extra retries do.

**Recommended fix — Version A: run mocking as a real, separate process, not a browser Service
Worker.**

Instead of intercepting requests *inside the page* (which is inherently tied to that page's own
lifecycle and re-triggers on every navigation), run an actual small HTTP server — reusing the
handler *logic* already in `e2e/mocks/handlers/*.ts` — that's already listening on a real port
before any test starts. Point Vite's dev proxy at that port instead of `:8080` for e2e runs.

- **Server:** either (a) a thin adapter that feeds real Node `http` requests through the *same*
  `http.post(url, resolver)` handler definitions already written (convert `IncomingMessage` →
  `Request`, run the matching resolver, write the `Response` back — Node 18+'s global
  `Request`/`Response` from `undici` make this straightforward, no extra dependency), or (b) a
  small hand-written Express/`http` server duplicating the same behavior. (a) avoids maintaining
  two copies of the same auth/feed mock logic and should be the default choice unless it proves
  awkward in practice.
- **Lifecycle:** Playwright's `webServer` config option accepts an array, not just one entry — add
  a second `webServer` block for the mock server alongside the existing `pnpm dev` one, so
  Playwright starts/stops it automatically with the same guarantees the dev server already gets.
- **Routing:** an env var (e.g. `VITE_API_PROXY_TARGET`) read in `vite.config.ts`, set only for the
  e2e/visual-regression Playwright run, pointing the `/api` proxy at the mock server's port instead
  of `:8080`.
- **Verification technique changes:** `response.fromServiceWorker()` (used today in
  `msw-setup.spec.ts` and AUTH-8's journey spec to prove "no real backend involved") no longer
  applies — these become genuine real network calls, just to a fake backend. Replace with an
  introspection point on the mock server itself (a request log the test can query, or a dedicated
  `/__mock/*` endpoint) — needs deciding as part of this ticket, not assumed.
- **A real, valuable side effect:** a real server can set genuine `Set-Cookie` response headers that
  the browser actually honors (unlike a Service-Worker-mocked response — see AUTH-8's summary for
  why that never works, httpOnly or not). This would let a reload-persistence test work directly,
  with no `seedRefreshCookieMirror`-style workaround needed at all.
- **Scope check:** `playwright.config.ts` currently shares one `webServer` (`pnpm dev`) across both
  the `e2e` and `visual-regression` projects — confirm during Phase 2 explore whether
  `visual-regression`'s specs (Home Feed only, still mock-data-internal, no real endpoint calls) are
  affected by switching the shared dev server's proxy target, or whether they need to keep pointing
  at `:8080`/nothing.

**Effort estimate — Version A: ~1.5–2.5 days.** Breakdown: mock server + adapter (~0.5–1 day,
handlers are already well-structured, main work is the Node request/response adapter and getting
cookie semantics right); Playwright `webServer` array + Vite proxy env wiring (~1–2 hours);
migrating the 2–3 specs that use `fromServiceWorker()` today to the new verification technique
(~2–4 hours); full e2e suite re-verification under the new topology (~2–4 hours, exploratory —
likely to surface something not anticipated here). This is a known-working pattern (a real backend
process for e2e mocking is common practice), so the estimate has reasonable confidence.

**Effort estimate — Version B (considered, not recommended): keep the Service Worker, make the
per-navigation handshake itself faster/lighter, rather than replacing the architecture.**
MSW doesn't expose a public "lightweight reconnect to an already-active worker" API — `worker.start()`
is the only documented entry point, and skipping it entirely leaves the new page instance with no
message channel to the (already-active) Service Worker, since Worker "clients" are per-document and
the handshake is what registers this specific document as active. A real Version B would mean either
monkey-patching MSW's internals (fragile — breaks silently on any MSW version bump, and reverse-
engineering undocumented internals is itself the bulk of the work) or hand-rolling a custom, minimal
SW registration protocol talking to the same `mockServiceWorker.js` script MSW ships (a full
reimplementation of part of MSW's browser client). **Estimate: at least 0.5–1 day of pure feasibility
investigation before any implementation estimate is even possible, with no guarantee it's achievable
at all** — meaingfully worse effort-to-confidence ratio than Version A, which is why Version A is the
recommendation despite touching more files.

**Acceptance criteria (once picked up):**
- A `page.reload()`-based reload-persistence test (the one AUTH-8 had to skip) passes reliably —
  run it repeated (`--repeat-each=10` or similar) with zero flakes before considering this done.
- All existing e2e specs still pass under the new mock topology.
- `AUTH-8`'s auth-journey spec gains its step 5 back (or a note explaining why not, if Version A
  turns up a new blocker).

**Delta (2026-07-17, executed as Version A):** the plan above didn't account for
`feed.ts`/`groups.ts`/`sport.ts`'s module-level mutable state (`postsState` etc.) — safe under the old
per-navigation Service Worker only because each page got a fresh module instance, a side effect of the
exact mechanism this ticket removes. One shared server process (`fullyParallel: true`) would otherwise
let concurrently-running tests corrupt each other's state. **Resolved (user-approved): per-test session
ids carried on an `x-e2e-session-id` header**, with every stateful handler keyed through a new
`sessionStore.ts` instead of a bare `let` — see the summary doc for the full design and rejected
alternatives (per-worker server processes, forcing `workers: 1`). Any future ticket adding new stateful
mock handler logic must use `createSessionStore`, not a module-level `let`, or it will silently
reintroduce cross-test corruption under parallel workers.

**Delta:** `seedRefreshCookieMirror` (fixtures.ts) is removed — it existed only to work around Set-Cookie
never being honored by a Service-Worker-mocked response, which a real server response no longer has.
Any future ticket referencing it should use the real cookie flow directly instead.

Full write-up, including the admin API shape (`/__mock/sessions/:id/...`) and verification results:
`client/docs/MSW-1_STANDALONE_MOCK_SERVER.md`.
