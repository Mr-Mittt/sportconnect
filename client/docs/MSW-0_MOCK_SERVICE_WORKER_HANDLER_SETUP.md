# MSW-0 — Mock Service Worker handler setup

**Status:** DONE (2026-07-08)
**Spec:** `client/docs/sporthub-auth-feed-integration-tickets.md` § MSW-0

## Context

Shared E2E network-mocking infrastructure for AUTH-8 and FEED-10, per the project's E2E convention
(`client/CLAUDE.md`): functional Playwright journeys never hit the real Spring Boot backend, MSW
intercepts at the browser level with handlers mirroring the documented API contracts exactly.

## How MSW actually works (browser mode)

MSW does not patch `fetch`/`axios`/`XMLHttpRequest` in JavaScript. It intercepts at the network
layer using a real browser primitive — a **Service Worker** — so the app's own code never knows
mocking is happening. That's the whole point: `src/` can call `apiClient.post('/auth/login', ...)`
exactly as it will in production, and nothing about that call changes when MSW is active.

**The two pieces, and why both are required:**

1. **`public/mockServiceWorker.js`** — a small, mostly-static script generated once by `msw init`
   (this ticket ran that; the file is committed, not regenerated per install). This is what the
   browser actually registers as the page's Service Worker. It does *not* contain your handler
   logic — it's a dumb relay.
2. **`setupWorker(...handlers)`** (`e2e/mocks/server.ts`) — the real MSW runtime, holding your
   actual handler definitions, running in the page's normal JS context (not inside the worker).

**The request lifecycle, step by step:**

1. `worker.start()` registers `mockServiceWorker.js` for the page's origin/scope and waits for it
   to become the *active, controlling* worker for that page — this is what its returned promise
   resolves on (which is why the fixture awaits `window.__mswReady` before issuing any request:
   requests made before the worker is controlling would go straight to the real network).
2. From then on, **every** `fetch`/XHR the page makes is intercepted by the browser itself, before
   it ever reaches a real network socket — the same mechanism that makes Service Workers useful for
   offline support in production PWAs, repurposed here for testing.
3. The static worker script can't run your matching logic (it has no access to your `handlers`
   array — service workers execute in an isolated scope with no shared memory with the page). So
   for each intercepted request, it relays the request's details to the page via `postMessage`.
4. The real MSW runtime in the page (`server.ts`'s `setupWorker(...)` call) receives that message,
   matches the request against the registered handlers by method + URL pattern (`http.post('/api/
   auth/login', resolver)`), runs the matching resolver, and sends the resulting `Response` back to
   the worker via another `postMessage`.
5. The worker fulfills the original fetch with that response (`event.respondWith(...)`). From the
   page's — and the app code's — perspective, this is indistinguishable from a real HTTP response.
6. Anything not matching a handler is configured to `bypass` (`worker.start({ onUnhandledRequest:
   'bypass' })`) — it falls through to the real network unmodified, rather than warning or erroring.

**Why the cookie behavior in `/refresh`'s handler is genuine, not simulated:** because interception
happens at the Service Worker layer — *above* the browser's own cookie jar, not inside it — a
`Set-Cookie` header returned by a handler is processed by the browser exactly as if a real server
had sent it, and a subsequent request's `Cookie` header is populated by the browser the same way
too. MSW's `cookies` resolver argument just reads that same real cookie jar. This is also why
`response.fromServiceWorker()` (used in the proof spec) is trustworthy: it's Playwright/CDP
reporting a real browser-level fact — that this specific response was served by a controlling
Service Worker — not something MSW self-reports.

**Why `src/` never needs to import MSW, in this specific setup:** the worker is started by
Playwright's `test.ts` fixture calling `page.addInitScript` to dynamically `import()` `/e2e/mocks/
server.ts` by URL — Vite's dev server transforms and serves that file like any other, since it
serves anything under the project root, not just files reachable from `src/index.html`'s module
graph. The app's own bootstrap code is never touched and never branches on "am I being tested." (A
common alternative pattern — seen in many MSW+React examples — has the app's own `main.tsx`
conditionally `import()` and start the worker behind an env var, so it also works for ad hoc local
dev mocking, not just Playwright. We didn't need that here since Playwright driving the worker
externally is sufficient for this ticket's scope.)

## Decision confirmed before implementation: scope narrowed to auth only

The epic's deliverable list includes `e2e/mocks/handlers/feed.ts` and `groups.ts`, and the backlog's
own SPORT-1 delta adds sport handlers too. All three require being "typed against the same
`types.ts` files used by the real hooks (AUTH-0, FEED-0)" per this ticket's own acceptance
criteria — but **FEED-0 (and SPORT-1) haven't shipped**, so no real `types.ts` exists yet for feed,
groups, or sport profiles. This is the identical problem AUTH-0 hit with MSW-0 itself (see that
ticket's resequencing delta), recurring one level down.

Applying the same principle the user already established for AUTH-0/MSW-0: **this ticket ships auth
handlers only.** Feed/groups/sport handlers are deferred to FEED-0/FEED-6/FEED-7/SPORT-1
respectively, matching the pattern already used elsewhere in this backlog (e.g. `HF-11`'s "MSW
upgrade map" — later tickets are expected to extend existing specs/handlers when their real types
land, not have everything pre-built speculatively). This was a judgment call applying prior
precedent, not re-asked of the user — see the backlog entry's delta note.

## What was built

### Backend — none. Client only.

### New dependency

`msw` (devDependency, v2.15.0). `pnpm exec msw init public --save` generated
`public/mockServiceWorker.js` (committed — MSW's own convention is to commit this file, not
regenerate it on every install; `pnpm`'s default build-script blocking means CI wouldn't run MSW's
postinstall step anyway) and added the `msw.workerDirectory` config block to `package.json`.

### Handlers (`e2e/mocks/handlers/`)

`auth.ts` — MSW v2 `http`/`HttpResponse` handlers for all four real auth endpoints, typed against
AUTH-0's `src/features/auth/types.ts` and `src/shared/types/api.ts`:
- `POST /api/auth/register`, `/login` — 200 + `ApiResponse<AuthResult>` + a `Set-Cookie:
  refreshToken=...` header mirroring `AuthController.buildRefreshCookie` (`HttpOnly`,
  `Path=/api/auth`, `SameSite=Strict`); 401/400 on bad credentials/validation.
- `POST /api/auth/refresh` — reads the **real browser cookie jar** via MSW's `cookies` resolver arg
  (the service worker sits above the cookie layer, so this is genuine cookie behavior, not a
  simulation); 401 if missing/stale, matching the real controller's `UnauthorizedException` (not
  Spring's default 400 for a missing cookie).
- `POST /api/auth/logout` — 401 if no `Authorization` header, else 200 + a cookie-clearing
  `Set-Cookie` (`Max-Age=0`).

`index.ts` — aggregates handler arrays; currently just `authHandlers`, with a comment explaining why
feed/groups/sport aren't here yet and which future tickets add them.

### Fixtures (`e2e/mocks/fixtures.ts`)

One named user (`mockUser`) plus `mockPassword`/`mockAccessToken`/`mockRefreshToken` constants,
reused by both the handlers and any future consumer spec — avoids each test inventing its own
ad-hoc values.

### Browser worker (`e2e/mocks/server.ts`)

`setupWorker(...handlers)` from `msw/browser`. Named `server.ts` per the ticket spec's literal
wording (a naming carryover from MSW's Node-mode `setupServer`, kept for consistency with the spec
even though this is browser mode).

### Playwright fixture (`e2e/mocks/test.ts`)

A `test.extend()` wrapper around `@playwright/test`'s `test` — the actual "wired into a Playwright
fixture" deliverable. Overrides the `page` fixture to `page.addInitScript(...)` a dynamic
`import('/e2e/mocks/server.ts')` before every navigation, so MSW starts intercepting before the
page's own scripts run. Any future spec that needs mocking imports `test`/`expect` from this file
instead of `@playwright/test` directly.

**Two non-obvious implementation constraints, both discovered by actually building and running
this rather than assumed:**

1. **The init script is a plain string, not a typed closure.** `e2e/**/*.ts` is covered by
   `tsconfig.node.json`, which has no DOM lib (already documented in HF-8's delta: "`page.evaluate`
   takes a string — no DOM lib in the e2e tsconfig"). A function literal referencing `window` would
   fail `tsc -b` here. Every `page.evaluate`/`addInitScript` call in the new spec follows the same
   string convention, consistent with `a11y.spec.ts`'s existing usage.
2. **Cross-directory imports (`e2e/` → `src/`) need explicit relative paths, not the `@/` alias.**
   The `@/` → `src/*` path mapping only exists in `tsconfig.app.json` (scoped to `include: ["src"]`).
   Adding the same mapping to `tsconfig.node.json` didn't resolve cleanly under `moduleResolution:
   nodenext` (path-aliased imports need matching extension handling nodenext doesn't reconcile the
   same way relative imports do) — reverted that attempt and used explicit relative paths
   (`../../src/features/auth/types.ts`) instead, with the `.ts` extension `nodenext` requires
   (`allowImportingTsExtensions` was already enabled project-wide).

### Why `src/` never imports from `e2e/`

The worker is loaded by URL (`/e2e/mocks/server.ts`), not by a compile-time TS import — Vite's dev
server transforms any file under the project root on request, not just files reachable from
`src/index.html`'s module graph. This means production bundles have zero knowledge MSW exists
(confirmed: the `pnpm build` output size is unchanged from AUTH-0's build, 256.15 kB), and there was
no need to gate a `src/main.tsx` bootstrap behind an env var the way some MSW+React examples do.

### Config changes

- `eslint.config.js` — new override disabling `react-hooks/rules-of-hooks` for `e2e/**/*.ts`.
  Playwright's `test.extend({ page: async ({ page }, use) => ... })` fixture API names its callback
  parameter `use`, which `eslint-plugin-react-hooks` misreads as a React hook call outside a
  component — a pure naming collision, not a real hook-rules violation, since `e2e/` is test infra
  with no React components. Also added `public/mockServiceWorker.js` to the ESLint `ignores` list
  (generated file, not authored code).

### Self-verifying proof (`e2e/flows/msw-setup.spec.ts`)

With no login form yet (AUTH-1 hasn't shipped), there's no real UI to drive these handlers through.
Per this ticket's own acceptance criteria ("verify via Playwright's network log, not just by
assumption"), added 4 tests that drive raw `fetch()` calls from the page context and assert on
`response.fromServiceWorker()` — the one unambiguous signal Playwright exposes proving a response
never reached a real network socket, rather than merely asserting the JSON shape (which could pass
even if MSW silently fell through to `localhost:8080`). Covers: successful login returns the
fixture, wrong credentials → 401, `/refresh` without a valid cookie → 401, `/logout` without an
`Authorization` header → 401. All 4 pass. These will very likely be superseded/absorbed by AUTH-8's
real journey spec once login/logout UI exists — kept for now as this ticket's own proof of
correctness, not meant as a permanent fixture.

## Explicitly out of scope

- `e2e/mocks/handlers/feed.ts`, `groups.ts`, sport handlers — deferred to FEED-0/FEED-6/FEED-7/
  SPORT-1 (see decision above).
- Any UI changes — AUTH-1/AUTH-2 build the actual login/register forms this infra will eventually
  back.
- Wiring `src/main.tsx` to ever import MSW — deliberately never needed (see "Why `src/` never
  imports from `e2e/`" above).

## Verification

- `pnpm exec tsc -b` — clean, both `app` and `node` projects.
- `pnpm lint` — clean.
- `pnpm exec playwright test --project=e2e e2e/flows/msw-setup.spec.ts` — 4/4 pass, including the
  `fromServiceWorker()` assertions.
- `pnpm e2e` (full suite) — 13/13 pass, no regressions in `smoke`/`a11y`/`home-feed-journey`.
- `pnpm test:visual` — 9 failures, but these are the pre-existing, documented HF-12 condition
  (baselines are Linux-rendered; local Windows runs always diff) — unrelated to this change, not a
  regression.
- `pnpm test` (Vitest) — 64/64 pass, unchanged from AUTH-0.
- `pnpm build` — succeeds, output size unchanged (256.15 kB), confirming zero production bundle
  impact.
