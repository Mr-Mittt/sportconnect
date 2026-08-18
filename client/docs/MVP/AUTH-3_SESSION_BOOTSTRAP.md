# AUTH-3 — Session bootstrap on app load

**Status:** DONE (2026-07-09)
**Spec:** `client/docs/sporthub-auth-feed-integration-tickets.md` § AUTH-3. No longer blocked — auth
backlog A2 (BE-1, cookie-based refresh) shipped 2026-07-08.

## Context

The access token lives in memory only (`authStore.accessToken`, no persist middleware) — it's gone
on every hard refresh, tab close, or reopen. This ticket restores the session from the httpOnly
`refreshToken` cookie on app load, before rendering assumes anything about auth state, so a valid
session survives a reload instead of silently logging the user out. The refresh response's `user`
object doubles as "who am I" — there's no separate `/api/users/me` endpoint.

## What was built

### `authStore.ts`

Added `setBootstrapped: () => void`, which flips `isBootstrapping` to `false`. `setSession`/
`clearSession` unchanged.

### `useSessionBootstrap.ts` (new, `src/features/auth/`)

`useMutation` wrapping `POST /auth/refresh` (no body — the httpOnly cookie is sent automatically by
the browser via `apiClient`'s `withCredentials: true`), same idiom as `useLogin`/`useRegister`.
`onSuccess` calls `setSession(user, accessToken)`; `onSettled` (success **or** failure) calls
`setBootstrapped()` — a failed refresh (no cookie, expired, revoked) is the normal logged-out case,
left silent, no visible error.

Triggered once via `useEffect` on mount, guarded by a `useRef` so it fires exactly once regardless
of how many times the effect body runs:

```js
const hasBootstrapped = useRef(false);
useEffect(() => {
  if (hasBootstrapped.current) return;
  hasBootstrapped.current = true;
  mutate();
}, [mutate]);
```

The guard exists because `main.tsx` wraps the app in React 18 `<StrictMode>`, which double-invokes
mount effects in dev. Without the guard, that would fire two concurrent `/refresh` calls sharing one
single-use refresh-token cookie. Traced through the actual backend during design review
(`AuthServiceImpl.refreshToken()`): the loser just gets a 401 with no `Set-Cookie` at all (the
controller only attaches the cookie on the success path, confirmed in `AuthController.java`), so the
race was already harmless — not a security issue — but wasteful, hence the guard.

### `App.tsx`

Calls `useSessionBootstrap()` unconditionally at the top of `App()` — fires on every route, not
just protected ones, since `ProtectedRoute` doesn't exist yet (AUTH-4).

### `App.test.tsx` — restructured

Every test case now renders through a `QueryClientProvider`-wrapped `renderApp` helper (previously
only the `/login` case did). This matches real production structure (`main.tsx` always wraps
`QueryClientProvider`) and was a real gap, not a style preference — `App` now calls
`useSessionBootstrap()` unconditionally, which needs a query client, so the 3 test cases that
previously rendered `<App />` in a bare `<MemoryRouter>` would have crashed. Also added a
`beforeEach` mocking `apiClient.post` to reject by default (there's no MSW in Vitest — it's
Playwright-only per MSW-0 — so this keeps the bootstrap call deterministic and fast instead of
attempting a real network call in jsdom).

## A real backend bug found during manual verification (fixed alongside this ticket, on the same branch)

Verifying against the real running backend (not just the unit tests) surfaced a genuine, unrelated
backend defect: `JwtTokenServiceImpl.generateToken()` built every JWT from entirely deterministic
claims (no random component), so two tokens generated for the same user within the same wall-clock
second were byte-identical, colliding against `refresh_tokens.token`'s `UNIQUE` constraint (500).
AUTH-3 made this newly reachable in ordinary usage (an app-load refresh firing within a second of
a preceding login/register — e.g. opening a second tab right after signing up). Fixed by adding a
`jti` claim (`UUID.randomUUID()`) to `generateToken()`. Full writeup, root cause trace, and
verification: `modules/auth/docs/MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`.

This was a deliberate scope decision, not scope creep: the user was asked explicitly (own branch/PR
vs. bundled here) and chose to bundle it into this branch rather than split it into a separate
backend PR.

## Explicitly out of scope

- `ProtectedRoute`/logout (AUTH-4) — nothing currently reads `isBootstrapping` or `user` to gate a
  route; that's AUTH-4's job.
- 401 retry-on-expired-access-token (AUTH-5) — this ticket only restores the session once, at load.
  A token that expires mid-session (1 hour in dev) is not retried automatically yet; the response
  interceptor stub in `apiClient.ts` stays a pass-through until AUTH-5.
- Any loading UI gated on `isBootstrapping` — nothing consumes it yet.

## Verification

- `pnpm exec tsc -b` — clean.
- `pnpm lint` — clean.
- `pnpm test` — 95/95 (existing 91 + 4 new: 3 `useSessionBootstrap`, 1 new `App.test.tsx` case
  asserting the refresh call fires on mount).
- `pnpm build` — clean production build.
- **Real backend verification** (`./gradlew :server:bootRun`, dev profile, existing Postgres/Redis
  containers), driven via a throwaway Playwright script (deleted after use):
  - No cookie at all → app renders normally, no crash, no visible error, exactly one `/refresh`
    call attempted (confirmed via network log).
  - Register (sets the cookie) → open a brand-new page in the same browser context (simulates
    closing/reopening a tab, since the browser cookie jar is context-scoped, not page-scoped) →
    exactly one `/refresh` call, 200, session restored with no re-entered credentials, and the
    refresh cookie's value rotated (confirmed old ≠ new).
  - Confirmed cookie attributes on the live response: `httpOnly: true`, `sameSite: Strict`,
    `path: /api/auth`, `secure: false` (correct for the dev profile).
  - This run is also what surfaced the `jti` bug (see above) — re-ran the full script after the
    backend fix and confirmed all cases pass cleanly.

---

### AUTH-3 · Session bootstrap on app load
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-3 ·
**Summary:** `client/docs/AUTH-3_SESSION_BOOTSTRAP.md`

Refresh-on-load restores the session from the httpOnly cookie; the refresh response's `user` object
doubles as "who am I" (no `/api/users/me` exists). **No longer blocked** — auth backlog A2 (BE-1)
shipped 2026-07-08; `POST /api/auth/refresh` genuinely reads/sets the cookie now. See
`modules/auth/docs/MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`.

**Deltas for later tickets:**
- **`App.test.tsx` now always wraps `QueryClientProvider`** (`renderApp` helper used by every case,
  not just `/login`/`/register`) — `App` calls `useSessionBootstrap()` unconditionally, so any test
  rendering `<App />` needs a query client, matching real `main.tsx` structure. Future tests adding
  cases to this file should keep using `renderApp`, not a bare `<MemoryRouter>`.
- **Found and fixed a real backend bug bundled into this branch (user decision — own-branch was the
  alternative, declined):** `JwtTokenServiceImpl.generateToken()` had no random component, so two
  refresh tokens for the same user within the same second collided on `refresh_tokens.token`'s
  `UNIQUE` constraint (500). Fixed with a `jti` claim. See **A4**
  (`modules/auth/docs/MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`) — not a client-side concern for AUTH-4/5
  to work around, the fix is already in place.
- **`useSessionBootstrap()` is called once, at the app root (`App.tsx`), regardless of route** —
  AUTH-4's `ProtectedRoute` should read `authStore.isBootstrapping`/`user` rather than re-triggering
  or duplicating this call anywhere else.
