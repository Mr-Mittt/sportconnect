# AUTH-5 · 401 refresh-retry interceptor

**Status:** DONE (2026-07-11) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-5

## What this ticket does

Centralizes handling for an access token expiring mid-session: `apiClient`'s response
interceptor catches a `401`, attempts one silent refresh, retries the original request
once with the new token, and only then gives up (clearing the session).

## Approved design (Phase 3, restated)

- Extend `apiClient.ts`'s existing response-interceptor stub with a named exported
  `handleResponseError(error)` function — same reasoning as `attachAuthHeader` (AUTH-0):
  testable directly with a synthetic `AxiosError`, no need to mock axios's internal
  adapter pipeline.
- On a `401`: skip the retry flow if the request already carries `_retry`, or if its URL
  is `/auth/refresh` (would recurse into another refresh attempt), `/auth/login`, or
  `/auth/register` (a 401 there means bad credentials, not an expired session — there's
  no prior session to restore, and attempting a refresh could silently resurrect an
  unrelated stale one from a still-valid cookie).
- Otherwise: mark `_retry`, await a shared module-level `refreshPromise` (kicking one off
  if none is in flight), update `authStore` via `setSession()` on success, retry the
  original request with the new token via `apiClient.request()`.
- On refresh failure: `clearSession()` and reject with the *original* error. No manual
  `window.location` redirect — `ProtectedRoute` already redirects to `/login` reactively
  once `authStore.user` goes `null` (same pattern `useLogout` relies on).
- `POST /auth/logout` is deliberately **not** excluded from the retry flow — a logout
  racing an expired token still gets retried with a fresh token so it fully revokes the
  session server-side, rather than silently no-op'ing on a stale `401`.

This matches the plan the user approved before implementation; nothing diverged during
build.

## What was built

- `apiClient.ts`: `handleResponseError()` (exported), `refreshAccessToken()`,
  `NO_RETRY_URLS`, and a module-level `refreshPromise` for de-duplicating concurrent
  401s. The retry call uses `apiClient.request(originalRequest)` rather than calling the
  instance directly (`apiClient(originalRequest)`) — behaviorally identical, but makes
  the retry path spy-able in tests the same way `apiClient.post` already is.
- `apiClient.test.ts`: 9 new tests covering the successful-retry path, the `_retry`
  loop-prevention guard, refresh failure → `clearSession()` + reject-with-original-error,
  the `/auth/refresh`/`/auth/login`/`/auth/register` exclusions, non-401 pass-through, and
  concurrent-401 de-duplication (asserts exactly one `/auth/refresh` call and two retried
  requests when two 401s land back-to-back).

## Key decisions

- **Concurrency guard is necessary, not defensive-programming theater**: the backend
  rotates the refresh token on every use and revokes the old one
  (`modules/auth/docs/A2_*`). Two independent, un-deduped refresh calls racing off the
  same stale cookie would have the loser 401 immediately — this is exactly the same race
  `useSessionBootstrap`'s `useRef` StrictMode guard exists to avoid, just triggered by
  concurrent request failures instead of a double-mount.
- **`/auth/logout` stays eligible for retry**, unlike `/auth/refresh`/`/auth/login`/
  `/auth/register` — user-confirmed during planning (see Phase 3 sign-off). The
  alternative (excluding logout too) was offered and declined.
- **No redirect logic added to the interceptor.** `clearSession()` alone is sufficient
  because `ProtectedRoute` (AUTH-4) already reacts to `authStore.user` becoming `null`.
  Duplicating a `window.location.href = '/login'` here (as the old CRA client's
  `utils/api.js` did) would fight React Router's own navigation and force a full page
  reload.

## Non-obvious constraints

- `handleResponseError` must stay a *named export* even though nothing outside the test
  file currently imports it directly — that's what makes it unit-testable without
  reaching into axios's adapter internals.
- The retry call is `apiClient.request(originalRequest)`, not `apiClient(originalRequest)`
  — these are different bound function references on an `axios.create()` instance
  (calling the instance directly vs. its `.request` method), and only `.request` is a
  regular object method `vi.spyOn` can intercept.

## Verification

- **Unit:** 13/13 tests in `apiClient.test.ts` (9 new), 124/124 client-wide. `tsc -b`
  clean. `pnpm lint` clean.
- **Against the real running backend** (not MSW): registered a fresh user through the
  actual UI (`POST /auth/register` → auto-login, confirmed no regression on the happy
  path), then force-returned one `401` on `POST /auth/logout` via Playwright route
  interception and clicked "Log out" through the real TopBar dropdown menu. Observed
  network sequence: `logout → 401`, `refresh → 200` (real backend, real httpOnly cookie),
  `logout → 200` (retried with the refreshed token) — confirming the full interceptor
  chain against the real `/auth/refresh` and `/auth/logout` contracts, not just mocked
  shapes. (Home Feed itself doesn't call a real endpoint yet — HF-3/HF-7 still read
  `mockData.ts` until FEED-1 ships — so `/auth/logout` was the only real authenticated,
  non-bootstrap call available to force a 401 against today.) The verification spec was
  a throwaway file, deleted after the run; AUTH-8 owns the committed, MSW-backed E2E auth
  journey.

---

### AUTH-5 · 401 refresh-retry interceptor
**Status:** `DONE` (2026-07-11) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-5 ·
**Summary:** `client/docs/AUTH-5_401_REFRESH_RETRY_INTERCEPTOR.md`

One silent refresh + one retry on 401; refresh failure → clean logout, never a retry loop.

**Deltas for later tickets:**
- **`handleResponseError()`** is a new named export on `apiClient.ts` (same reasoning as AUTH-0's
  `attachAuthHeader`) — reuse it as the reference pattern for any future interceptor logic that
  needs direct unit-testability instead of mocking axios's adapter pipeline.
- **`/auth/refresh`, `/auth/login`, `/auth/register` are excluded from the retry flow**
  (`NO_RETRY_URLS` in `apiClient.ts`) — a 401 on any of those means "recursion risk" or "bad
  credentials", not "expired session". **`/auth/logout` is deliberately NOT excluded** (user
  decision) — a logout racing an expired token still gets retried so it fully revokes server-side.
- **Concurrent 401s are deduped** via a shared module-level `refreshPromise` — the backend rotates
  the refresh token on every use, so two independent refresh calls off the same stale cookie would
  race and the loser would 401. Any future code adding a second "trigger a refresh" path (there
  isn't one today beyond `useSessionBootstrap` and this interceptor) should share this same
  primitive rather than introducing a second independent refresh call.
- **No `window.location` redirect on refresh failure** — `clearSession()` alone is sufficient
  because `ProtectedRoute` (AUTH-4) already reacts to `authStore.user` going `null`. Don't
  reintroduce a manual redirect here.
- **Retry uses `apiClient.request(originalRequest)`, not `apiClient(originalRequest)`** — same
  runtime behavior, but only `.request` is spy-able as a normal object method in tests.
- **Real-backend verification used `/auth/logout` as the target endpoint, not `/posts/feed`** —
  Home Feed still reads `mockData.ts` until FEED-1 ships, so today `/auth/logout` is the only real
  authenticated, non-bootstrap call the app actually makes. FEED-1/FEED-6/FEED-7/SPORT-1 should each
  re-confirm this interceptor still works once their real endpoints exist, since a 401 on a
  `GET /posts/feed`-style read has never been exercised against the real backend by this ticket.
