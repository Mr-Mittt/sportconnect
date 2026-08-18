# AUTH-0 — Types, API client, and auth store

**Status:** DONE (2026-07-08)
**Spec:** `client/docs/sporthub-auth-feed-integration-tickets.md` § AUTH-0

## Context

Foundation ticket every later AUTH/FEED ticket depends on: auth-related TypeScript types matching
the real backend contracts, an axios client configured for cookie-based refresh + in-memory access
tokens, and the Zustand slice holding session state. Originally next in the backlog's implementation
order was **MSW-0**, not AUTH-0 — see the resequencing decision below.

## Decisions confirmed before implementation

1. **Resequenced ahead of MSW-0.** The backlog lists MSW-0 (#15) before AUTH-0 (#16) and marks them
   parallel (`∥`), but MSW-0's own acceptance criteria requires handlers "typed against the same
   `types.ts` files used by the real hooks (AUTH-0, FEED-0)" — which don't exist until those ship.
   User decision: do AUTH-0 first. `client/docs/BACKLOG_MVP.md`'s MSW-0 entry carries a delta note
   explaining this.
2. **Backend gap found and fixed as part of this ticket.** `AuthServiceImpl.toUserResponse()`
   (`modules/auth/auth-impl`) — the mapper every one of `login`/`register`/`refresh` uses to build
   `AuthResponse.user` — only returned `{id, email, firstName, lastName, username, roles}`. Both
   the epic's illustrative `User` sketch *and* its "Backend reality check" field list assumed the
   full `UserResponse` DTO (19 fields, including `avatarUrl`/`phoneNumber`), because that's what
   `GET /api/users/{userId}` returns — but `AuthResponse.user` is a hand-built `Map`, not the same
   object, and nobody had re-verified it since the epic was written. Without `avatarUrl`, TopBar
   would have no avatar source from the login/session response at all. User decision: fix the
   backend now, not defer it. See "Backend change" below.
3. **Non-nullable name fields.** `firstName`/`lastName`/`username` are typed `string`, not
   `string | null` (the epic sketch's guess) — the backend map coerces a missing value to `""`
   before serialization; the key is always present.

## What was built

### Backend (`modules/auth/auth-impl`)

`AuthServiceImpl.toUserResponse()` (`AuthServiceImpl.java:194-209`) switched from `Map.of(...)`
(which throws on any null value) to a mutable `HashMap`, and now includes `phoneNumber` and
`avatarUrl` — both passed through as real nulls when absent, matching `UserResponse`'s own
nullability rather than being coerced to `""` like the three name fields (deliberately not touched,
to avoid changing already-tested existing behavior for those three). Verified with
`./gradlew :modules:auth:auth-impl:test` — full suite passes, no existing test asserted on the old
6-key shape so this was a safe additive change.

### Client types (`src/features/auth/types.ts`)

`User`, `LoginPayload`, `RegisterPayload`, `AuthResult` — typed against the corrected backend
contract (see decisions above), not the epic's sketch verbatim.

### Shared type (`src/shared/types/api.ts`, new)

`ApiResponse<T>` — the `{ success, message, data, timestamp }` envelope every real endpoint uses
(`modules/common/.../ApiResponse.java`). Not called out explicitly in the epic, but every real
hook (auth now, feed/groups in FEED-0) needs it — belongs in `shared/` so it's defined once.

### API client (`src/app/apiClient.ts`, new)

`axios.create({ baseURL: '/api', withCredentials: true })` — `/api` is proxied to the Spring Boot
backend at `:8080` in dev (`vite.config.ts`); `withCredentials` is required so the httpOnly refresh
cookie is sent/received. The request interceptor is a separately-exported named function,
`attachAuthHeader`, rather than an inline lambda — this lets it be unit-tested directly without
mocking axios's internals. It reads the current token via `useAuthStore.getState().accessToken`
(Zustand's non-hook accessor, safe to call outside a component) and sets `Authorization: Bearer`
when present. The response interceptor is a pass-through stub with a comment marking it as AUTH-5's
extension point (silent-refresh-then-retry-once on 401).

### Auth store (`src/app/authStore.ts`, new)

Zustand slice exactly per spec: `user`, `accessToken`, `isBootstrapping`, `setSession`,
`clearSession`. Plain `create()` with no persist middleware — that absence is the actual security
property (the token must not survive a refresh via storage). `isBootstrapping` initializes `true`
but nothing in this ticket flips it; AUTH-3's session bootstrap owns that transition.

### Tests

- `src/app/authStore.test.ts` — spies on `Storage.prototype.setItem` (covers both `localStorage`
  and `sessionStorage`, which both inherit from it) across a full `setSession`/`clearSession`
  cycle and asserts it's never called; plus state-shape tests for `setSession`/`clearSession`/the
  initial `isBootstrapping` value.
- `src/app/apiClient.test.ts` — asserts `withCredentials: true` and `baseURL: '/api'` on the
  client's defaults; unit-tests `attachAuthHeader` directly against a fake `InternalAxiosRequestConfig`
  (using a real `AxiosHeaders` instance) for both the token-present and no-token cases.

### New dependencies

`axios`, `zustand` — neither was in the client before this ticket.

## Explicitly out of scope

- Login/register UI (AUTH-1, AUTH-2).
- Real 401 refresh-retry logic in the response interceptor body (AUTH-5) — stub only.
- Session bootstrap wiring / flipping `isBootstrapping` (AUTH-3).
- Wiring TopBar to the now-available `avatarUrl` — not covered by any ticket in either epic yet;
  flagged here as a gap, not built.

## Verification

- `pnpm exec tsc -b` — clean, strict mode.
- `pnpm exec vitest run src/app/` — 8/8 new tests pass.
- `pnpm test` (full suite) — 64/64 pass, no regressions.
- `pnpm lint` — clean.
- `pnpm build` — production build succeeds.
- `./gradlew :modules:auth:auth-impl:test` — backend change verified, full module suite passes.

---

### AUTH-0 · Types, API client, auth store
**Status:** `DONE` (2026-07-08) · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § AUTH-0 ·
**Summary:** `client/docs/AUTH-0_TYPES_API_CLIENT_STORE.md`

Types 1:1 with real DTOs, `apiClient` with `withCredentials: true` + Bearer interceptor, Zustand
auth slice. Access token in memory only — a test asserts no storage API is touched.

**Deltas for later tickets:**
- **`User.firstName`/`lastName`/`username` are non-nullable `string`**, not `string | null` as the
  epic sketch guessed — the backend coerces a missing value to `""` before serialization.
- **`avatarUrl`/`phoneNumber` added to the backend response** (`AuthServiceImpl.toUserResponse()`)
  as part of this ticket — they didn't exist in `AuthResponse.user` before, only in the unrelated
  full `UserResponse` DTO the epic's reality-check section was actually describing. Both are
  `string | null` on the client type.
- New shared `src/shared/types/api.ts` (`ApiResponse<T>`) — reuse this for FEED-0's types, don't
  redefine the envelope per feature.
- `attachAuthHeader` in `src/app/apiClient.ts` is a named export specifically so AUTH-1..AUTH-5 (and
  their tests) can exercise it directly rather than mocking axios internals.
- TopBar is still not wired to `avatarUrl` — no ticket in either epic covers that; flagged, not
  built.
