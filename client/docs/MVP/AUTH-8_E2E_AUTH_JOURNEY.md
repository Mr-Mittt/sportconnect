# AUTH-8 · E2E functional test — auth journey

**Status:** DONE (2026-07-13) · **Type:** Testing · **Dependency:** MSW-0, AUTH-1..AUTH-5 · **Spec:** AUTH/FEED epic § AUTH-8

## What this ticket does

A Playwright flow (`e2e` project) through the real login/register/session/logout UI, network
intercepted by MSW-0's handlers. Per the epic: register → auto-login, logout → protected routes
redirect, login success, login failure, session-survives-reload, simulated session expiry, and
deep-link-while-logged-out → redirect-then-return.

## What shipped vs. the approved design

The epic specs one continuous 7-step journey with a hard "zero real network calls" acceptance
criterion. What shipped is **two shorter tests covering 6 of the 7 steps, with that specific
acceptance criterion dropped** — both changes are the direct result of a real, reproducible
architectural finding, not a shortcut. This diverges from the original design (which assumed the
epic's spec was directly buildable), and the divergence is the substantive output of this ticket.

## The investigation

Building step 5 ("reload while logged in — still authenticated") surfaced that MSW's Service
Worker setup and the app's own `useSessionBootstrap` bootstrap fetch **race on every real
navigation** (`page.goto()`/`page.reload()`, not client-side route changes) after the page's first.
Four things were tried and rejected before concluding this needs an architecture change, not a test
fix:

1. **A cookie mirror** (`seedRefreshCookieMirror`) — necessary but not sufficient. Proved via four
   targeted tests that a real `Set-Cookie` response header is never honored by the browser for a
   Service-Worker-mocked (or Playwright `route.fulfill()`-mocked) response at all, so a genuine
   Playwright-managed cookie is the only thing that survives a reload. Kept as correct, reusable
   infrastructure even though nothing currently exercises it.
2. **Gating the `/auth/refresh` request via `page.route()`** until MSW was confirmed ready — still
   lost every time. CDP-level route interception appears to bypass Service Worker dispatch once it
   grabs a request.
3. **Gating the app's entry module (`/src/main.tsx`)** the same way — deadlocked; it also blocked
   Vite's concurrent fetch of the MSW setup module the wait itself depended on.
4. **Bounded retries** (`navigateUntil`, later removed) — made things measurably *worse*, not
   better: 15 retries had a 0% success rate where 5 retries occasionally succeeded. Instrumented
   timing (real measured data, not estimated) explains why: MSW's setup consistently takes
   ~150–300ms regardless of navigation count, while the app's own bootstrap gets *faster* on each
   repeat navigation as Vite's dev-server module cache warms — the gap widens in the app's favor the
   more navigations a test accumulates, so more retries (= more navigations) make it worse.

This was written up as a full instrumented timeline (published as an artifact during the
investigation) and turned into backlog ticket **MSW-1**
(`client/docs/BACKLOG_MVP.md`), which recommends replacing the per-navigation Service
Worker setup with a standalone mock HTTP server — a real, out-of-process server has no
per-navigation setup cost at all, structurally removing the race. A lighter-touch alternative
(keep the Service Worker, make its handshake faster) was evaluated and rejected: MSW has no public
API for a partial/lightweight reconnect, so that path means reverse-engineering undocumented
internals with no guaranteed outcome — a worse effort-to-confidence ratio than a standalone server.

**A second, related finding surfaced while finalizing this ticket**: the race isn't confined to
reload-heavy steps. *Any* test accumulating enough real navigations is at risk — even the
epic's plain `goto()`-based steps (register, logout, deep-link checks) fire a bootstrap fetch on
every navigation. Two further adjustments followed from this, both documented in
`auth-journey.spec.ts`'s own header comment:
- Split the epic's one continuous journey into two shorter, independent tests, keeping each test's
  own navigation count low enough to stay reliable.
- Dropped the "zero real network calls" (`response.fromServiceWorker()`) assertion entirely — not
  achievable for any multi-navigation journey under the current architecture. `msw-setup.spec.ts`
  already proves MSW *can* intercept these exact endpoints, in isolation, where the race reliably
  resolves in MSW's favor; that's the right place for that property.

**Step 6 (simulated expired session) needed a redesign, not just a workaround.** A reload-based
version (matching the epic's literal framing) was still unreliable in *normal, non-repeated* suite
runs, and raising its timeout to 15s didn't help — it hung past that, meaning the failure mode was a
genuine stuck state, not "needs more time." Rewritten to simulate the same scenario via AUTH-5's
existing 401-retry interceptor instead: force one 401 on `POST /auth/logout` via `page.route()` (the
same technique already proven reliable verifying AUTH-5 itself against the real backend), which
triggers AUTH-5's silent-refresh-then-retry — and since no valid session cookie exists in this test
either way, the refresh fails too, and `useLogout`'s `onSettled` clears the session regardless of the
network outcome. This never leaves the one, already-stable page load from login, so there's no
second real navigation to race MSW's setup against at all. Verified 20/20 clean runs under
`--repeat-each=10` (vs. the reload-based version's ~35–60% failure rate in equivalent testing).

## What was built

- `e2e/flows/auth-journey.spec.ts` — two tests: `Auth journey — register, logout, login` (epic
  steps 1–4) and `Auth journey — expired session, then protected deep link` (epic steps 6–7, step 6
  redesigned as above). Step 5 is not implemented; a comment at its would-be position points to the
  file header and MSW-1.
- `e2e/mocks/fixtures.ts` — `seedRefreshCookieMirror()` and `simulateExpiredSessionOnNextLoad()` +
  `e2e/mocks/expireSession.ts` — both correct, both currently unused by any shipped spec, both
  documented as kept for when MSW-1 lands and a reload-based reliability bar becomes achievable.
- `e2e/mocks/test.ts` — unchanged in the final version (an intermediate `window.__mswStarted` flag
  and gating mechanism was added and then removed once proven ineffective — see the investigation
  above).

## Key decisions

- **Investigate and fix root cause over patching symptoms.** Given the choice between "make step 5
  pass somehow" and "understand why it fails, fix what's fixable, defer what isn't," the latter was
  taken — confirmed with the user at each major juncture (cookie-mirror fix, retry approach, final
  scope cut) rather than assumed.
- **A semantically-faithful test beats a literal one that's flaky.** Step 6's redesign changes *how*
  an expired session is simulated (a failed authenticated action vs. a failed reload) but reaches the
  exact same target state the epic specifies (refresh handler failure → redirected to `/login`,
  session cleared) — reliably, using already-proven infrastructure, instead of literally versus the
  epic's wording at the cost of a coin-flip test.
- **Dropping an acceptance criterion is not the same as ignoring it.** "Zero real network calls" is
  still verified — just at the right granularity (`msw-setup.spec.ts`'s isolated, single-navigation
  tests) rather than asserted somewhere it was proven false.

## Verification

- 124/124 client-wide unit tests pass (unchanged — no unit-level code touched). `tsc -b` clean.
  `pnpm lint` clean.
- Full `e2e` project: 29/29 passing, confirmed clean across 6 consecutive full-suite runs plus a
  10x-repeated run of `auth-journey.spec.ts` alone under parallel load (20/20).
- `visual-regression` project: 9 pre-existing Windows/Linux baseline-noise failures in
  `app-home-feed.spec.ts` (documented since HF-12/HF-13 — local Windows runs always show this;
  CI's Linux baselines are authoritative), unrelated to this ticket's changes.

---

### AUTH-8 · E2E functional test — auth journey
**Status:** `DONE` (2026-07-13) · **Type:** Testing · **Dependency:** MSW-0, AUTH-1..AUTH-5 · **Spec:** AUTH/FEED epic § AUTH-8 ·
**Summary:** `client/docs/AUTH-8_E2E_AUTH_JOURNEY.md`

**Delta:** ships 6 of the epic's 7 steps, split across two independent tests instead of one
continuous journey, and drops the "zero real network calls" acceptance criterion. All three changes
trace to one real, instrumented finding: MSW's per-navigation Service Worker setup races the app's
own bootstrap fetch, and the race gets *worse* with more navigations in one test (Vite's module
cache speeds up the app, not MSW's SW handshake). **Step 5 (reload-persistence) is not
implemented** — filed as backend/infra ticket **MSW-1** below with a recommended fix (standalone
mock server). Step 6 (simulated expired session) is redesigned to trigger via AUTH-5's 401-retry
interceptor instead of a reload, avoiding the same race entirely — see the summary doc for the full
investigation, including why a straightforward retry-based fix was tried and made things worse, not
better.
