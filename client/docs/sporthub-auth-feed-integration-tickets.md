# Epic: Auth Integration + Groups/Feed Integration (React implementation)

**Status: draft, for discussion once the Home Feed epic is finished. Not ready to implement yet.**

Companion to `sporthub-home-feed-tickets.md`. Where that epic scoped the Home Feed *screen*, this one scopes wiring the new client to the **real, already-existing backend** for auth, the core feed, groups, and hashtags — the pieces Home Feed currently mocks. Sport profiles and matches stay mocked; both are covered by separate backend gaps, not this epic (see the bottom of this file).

Everything below was verified by reading the actual backend source under `modules/` (controllers, DTOs, services) — not the design docs, which in a few places describe an earlier or aspirational version of the API. Where the docs and the code disagreed, the code wins and is called out explicitly.

---

## Backend reality check — read this before scoping sprints

### Auth (`modules/auth`) — complete, but the new client must not copy the old client's mistakes

Real `AuthController` endpoints (base path `/api/auth`), verified against source:

| Endpoint | Request body | Response (`ApiResponse<T>` wrapped) |
|---|---|---|
| `POST /register` | `{ email, password (min 8 chars), fullName (max 200), phoneNumber? }` | `AuthResponse { accessToken, refreshToken, tokenType: "Bearer", expiresIn, user }` — registration **also logs the user in**, no separate login step needed |
| `POST /login` | `{ email, password }` | Same `AuthResponse` shape |
| `POST /refresh` | `{ refreshToken }` | Same `AuthResponse` shape (new access token **and** a fresh `user` object — useful for session bootstrap, see AUTH-3) |
| `POST /logout` | none — `userId` is a **query param**, not a body field | `ApiResponse<Void>` |
| `POST /verify-email` | `{ token }` | `ApiResponse<Void>` |
| `POST /forgot-password` | `{ email }` | Always returns a generic success message — **not actually implemented yet** (controller comment: "placeholder... completed when user module is integrated"). Don't build a real forgot-password flow against this; show a "check your email" state but know it currently does nothing server-side. |
| `POST /reset-password` | `{ token, newPassword }` | `ApiResponse<Void>` |

**Two real problems found in the old client, do not repeat them:**

1. **Wrong logout contract.** The old `AuthContext.jsx` called `POST /api/auth/logout` with `{ refreshToken }` as a JSON body. The actual endpoint signature is `logout(@RequestParam UUID userId)` — it ignores a body entirely and expects `userId` as a query param. The old client's logout call has never matched the real backend. The new client must call `POST /api/auth/logout?userId={currentUser.id}`.
2. **Security gap in `/logout` itself (flag to backend owner, not fixable from the client):** the endpoint has no `@PreAuthorize` and doesn't read the authenticated principal — it trusts whatever `userId` the caller passes. As written, any caller who can reach the endpoint can pass an arbitrary `userId` and revoke a different user's session. This should be fixed backend-side to derive the user from the authenticated principal (or at least verify it matches), not from a client-supplied param. Track as **BE-2** below; the frontend ticket (AUTH-4) implements against the current contract but should not assume it's secure.

**Token storage change needed (per `CLAUDE.md`):** `AuthResponse` currently returns `refreshToken` directly in the JSON body (confirmed in `AuthResponse.java`). The new client needs the refresh token delivered via an httpOnly cookie instead, set by the backend on `/login`, `/register`, and `/refresh`. This is **BE-1** below — a backend change, not something the frontend can work around alone.

### Feed, hashtags, and broadcasts (`modules/social`) — complete, corrects an earlier assumption

Contrary to what was assumed when Home Feed was first scoped, trending hashtags and group broadcasts both already have real backend support:

| Endpoint | Notes |
|---|---|
| `GET /api/posts/feed` | Paginated (`page`, `size`, `sort` via Spring `Pageable`), personalized, requires auth |
| `GET /api/posts/group/{groupId}` | Paginated group-specific feed |
| `GET /api/posts/mine` | Current user's own posts |
| `GET /api/posts/{postId}` | Single post |
| `POST /api/posts` | Create — `{ content, latitude?, longitude?, locationName?, sportId?, groupId?, postType?, visibility, mediaUrls?, broadcastEndTime? }` |
| `PUT /api/posts/{postId}` | Update |
| `DELETE /api/posts/{postId}` | Delete |
| `POST` / `DELETE /api/posts/{postId}/like` | Like / unlike |
| `POST /api/posts/{postId}/comments`, `GET /api/posts/{postId}/comments` | Create / list comments (paginated) |
| `DELETE /api/posts/comments/{commentId}` | Delete comment |
| `POST` / `DELETE /api/posts/comments/{commentId}/like` | Like / unlike comment |
| `GET /api/posts/hashtag/{tag}` | Posts by hashtag |
| `GET /api/posts/broadcast` | **This is Home Feed's "group broadcasts."** Broadcasts are `Post` rows with `postType = GROUP_BROADCAST` and an expiring `broadcastEndTime` — not a separate entity. No new backend work needed. |
| `PATCH /api/posts/{postId}/broadcast-end-time` | Extend/change a broadcast's expiry |
| `GET /api/hashtags/trending` | **This is Home Feed's "trending hashtags."** Paginated. |
| `GET /api/hashtags/suggest?q=` | Typeahead, not needed for Home Feed but useful for a future post-composer |

`PostResponse` fields (camelCase, matches JSON 1:1 — no mapping layer needed): `id, userId, userFullName, userAvatarUrl, postType, groupId, content, latitude, longitude, locationName, sportId, sportName, visibility, media[], hashtags[], previewComments[], likeCount, commentCount, shareCount, isLikedByCurrentUser, createdAt, updatedAt, broadcastEndTime`.

`HashtagResponse`: `{ id, tag, usageCount }`.

### Groups (`modules/social`, `group-impl`) — complete, larger than previously documented

24+ endpoints under `/api/groups`, including CRUD, membership, join requests, settings, an **invitation system** (not mentioned in the original group backend doc — `POST /{groupId}/invitations`, approve/decline/accept/reject, list sent/pending), pinned posts, and permission checks (`is-owner`, `is-admin`, `is-member`, `user-role`). Relevant to Home Feed's `GroupSidebar`-equivalent:

| Endpoint | Notes |
|---|---|
| `GET /api/groups/user/{userId}` | Paginated list of groups the user belongs to — this is what populates the group switcher |
| `GET /api/groups/{groupId}` | Group detail, includes top 3 pinned posts on this call only |
| `POST /api/groups` | Create — `{ groupName, description?, isPrivate }` |
| `POST /api/groups/join-requests` | Request to join |
| `GET /api/groups/{groupId}/members` | Paginated members |

`GroupResponse` fields: `id, sportId, groupName, description, avatarUrl, coverUrl, isPrivate, isActive, createdBy, createdByFullName, memberCount, currentUserRole, createdAt, updatedAt, pinnedPosts[]` (pinnedPosts only populated on `getGroup`, null elsewhere).

### User (`modules/user`) — no "get current user" endpoint

There's no `/api/users/me`. `UserResponse` (returned inside `AuthResponse.user` on login/register/**refresh**) is the only way to get the current user's full profile without already knowing their ID — `GET /api/users/{userId}` exists for re-fetching by ID afterward. This shapes the session-bootstrap design in AUTH-3: the refresh call itself doubles as "who am I," there's no separate identity check needed.

`UserResponse` fields: `id, email, firstName, lastName, username, phoneNumber, dateOfBirth, gender, bio, avatarUrl, coverUrl, location, heightCm, weightKg, shoeSizeCm, isEmailVerified, isActive, roles[], createdAt, lastLoginAt`.

---

## Backend tickets (not owned by this frontend epic, but block parts of it)

**BE-1: Move refresh token to httpOnly cookie.** `/api/auth/login`, `/register`, and `/refresh` currently return `refreshToken` in the JSON body. Change them to set it via `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict` and drop it from the body. AUTH-3/AUTH-5 below are written against the cookie-based contract — they'll need adjusting if this hasn't shipped yet when frontend work starts.

**BE-2: Fix `/api/auth/logout` authorization.** Currently trusts a client-supplied `userId` with no auth check. Should derive the user from the authenticated principal (consistent with every other endpoint in this controller, which all use `@AuthenticationPrincipal` or `Authentication`) and ignore or validate any client-supplied value.

---

## Implementation roadmap

Two sequential sub-epics — Feed Integration genuinely cannot work without Auth Integration, since every feed/group endpoint requires an authenticated user.

**Phase 0 — Auth Integration** (blocks everything else in this file, and blocks HF-3/HF-5/HF-6 de-mocking in the Home Feed epic)
- MSW-0: Mock Service Worker handler setup (parallel with AUTH-0 — shared infra both sub-epics' E2E tickets depend on)
- AUTH-0: types, API client, auth store
- AUTH-1: Login
- AUTH-2: Register
- AUTH-3: Session bootstrap (refresh-on-load)
- AUTH-4: ProtectedRoute + logout
- AUTH-5: 401 refresh-retry interceptor
- AUTH-6: Hardening (errors, rate-limit messaging, accessibility)
- AUTH-8: E2E functional test — auth journey (Playwright + MSW)
- AUTH-7: QA / acceptance checklist

**Phase 1 — Groups/Feed Integration** (depends on Phase 0)
- FEED-0: types + data hooks scaffold
- FEED-1: Feed + PostCard (real feed, likes, delete)
- FEED-2: CommentSection (real)
- FEED-3: CreatePostForm (real)
- FEED-4: Group switching (real groups list)
- FEED-5: CreateGroupModal + JoinGroupModal (real)
- FEED-6: TrendingHashtags (real) — replaces HF-5's mock version
- FEED-7: GroupBroadcasts (real) — replaces HF-6's mock version
- FEED-8: Hardening (loading/error states, pagination edge cases, empty states)
- FEED-10: E2E functional test — feed/groups journey (Playwright + MSW)
- FEED-9: QA / acceptance checklist

---

## MSW-0: Mock Service Worker handler setup

**Description**
Shared infrastructure for AUTH-8 and FEED-10: intercepts network calls at the browser level during E2E runs so functional flows never hit the real Spring Boot backend, per the project's E2E convention in `CLAUDE.md`.

**Deliverables**
- `e2e/mocks/handlers/auth.ts` — handlers for `POST /api/auth/{register,login,refresh,logout}`, returning `AuthResult`-shaped fixtures matching the real DTOs documented above exactly (field names, nesting, the `ApiResponse<T>` envelope).
- `e2e/mocks/handlers/feed.ts` — handlers for `GET /api/posts/feed`, `/group/{id}`, `/broadcast`, `/hashtag/{tag}`, like/unlike, comments, and `GET /api/hashtags/trending`.
- `e2e/mocks/handlers/groups.ts` — handlers for `GET /api/groups/user/{userId}`, create group, join request.
- `e2e/mocks/server.ts` — MSW `setupWorker` (browser mode, since Playwright drives a real browser) wired into a Playwright fixture that starts before each E2E test and resets handlers between tests.
- A small set of named fixtures (e.g. "logged in user with 2 groups and 5 feed posts", "user with an expired session") reused across AUTH-8 and FEED-10 rather than each test inventing its own ad-hoc response shapes.

**Acceptance criteria**
- Handler response shapes are typed against the same `types.ts` files used by the real hooks (AUTH-0, FEED-0) — if a real DTO field is renamed, the handler fails to typecheck rather than silently drifting.
- Running the E2E suite makes zero real network calls to any `localhost:8080`-style backend URL (verify via Playwright's network log in CI, not just by assumption).
- Documented in the repo README: this is a known trade-off (see `CLAUDE.md`'s testing convention) — MSW passing doesn't prove the real backend still matches, re-verify periodically.

---

## AUTH-0: Types, API client, and auth store

**Description**
Foundation every other AUTH/FEED ticket depends on: request/response types matching the real DTOs above, an API client configured for cookie-based auth, and the Zustand slice holding session state.

**Deliverables**
`src/features/auth/types.ts` — typed 1:1 against the real DTOs:
```ts
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  roles: string[];
}

export interface LoginPayload { email: string; password: string; }
export interface RegisterPayload {
  email: string; password: string; fullName: string; phoneNumber?: string;
}
export interface AuthResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
  // refreshToken intentionally NOT typed here once BE-1 ships — it never
  // reaches JS, it arrives as an httpOnly cookie.
}
```

`src/app/apiClient.ts` — axios instance (or fetch wrapper) with `withCredentials: true` (required so the httpOnly refresh cookie is sent), a request interceptor attaching the in-memory access token as `Authorization: Bearer`, and a response interceptor stub that AUTH-5 fills in.

`src/app/authStore.ts` — Zustand slice:
```ts
interface AuthState {
  user: User | null;
  accessToken: string | null; // memory only — see below
  isBootstrapping: boolean;   // true until AUTH-3's initial refresh check resolves
  setSession: (user: User, accessToken: string) => void;
  clearSession: () => void;
}
```

**Acceptance criteria**
- `accessToken` is never written to `localStorage`/`sessionStorage` — a Vitest test asserts no storage API is touched by this store.
- `apiClient` sends cookies (`withCredentials: true`) on every request.
- Types compile in strict mode and match the real field names verified above (no guessing).

---

## AUTH-1: Login

**Description**
Login form and submission flow against `POST /api/auth/login`.

**Behavior**
- Fields: email, password. Client-side validation mirrors the server's (`email` format, password non-empty) but the server response is the source of truth for errors.
- On success: `authStore.setSession(response.data.user, response.data.accessToken)`, redirect to Home Feed.
- On failure: surface `ApiResponse.message` inline near the form, don't leak whether it was the email or password that was wrong (matches the backend's generic failure message).

**Acceptance criteria**
- Wrong credentials show an inline error without redirecting.
- Successful login populates `authStore` and the app immediately reflects an authenticated state (no extra reload needed).
- Form is keyboard-submittable (Enter key), inputs have associated labels.

---

## AUTH-2: Register

**Description**
Registration form against `POST /api/auth/register`.

**Behavior**
- Fields: email, password (min 8 chars — enforce client-side to match `RegisterRequest`'s `@Size(min = 8)`), full name (max 200 chars), phone number (optional, max 20 chars).
- **Register logs the user in** — the response is the same `AuthResult` shape as login. Call `setSession` directly and redirect into the app; don't add an artificial "now go log in" intermediate step the way the old client's docs described, since the backend already returns working tokens.

**Acceptance criteria**
- Validation errors (client-side length/format checks) show before submitting; server-side validation errors (e.g. email already taken) show after.
- Successful registration lands the user in the app already authenticated, matching AUTH-1's post-login state.

---

## AUTH-3: Session bootstrap on app load

**Description**
On a fresh page load, there's no access token in memory (by design — it's never persisted). This ticket restores the session from the httpOnly refresh cookie before rendering any protected route.

**Behavior**
- On app mount: set `isBootstrapping = true`, call `POST /api/auth/refresh` (no body needed once BE-1 ships — the cookie is sent automatically by the browser; until then, this ticket has no refresh token to send from JS and is blocked on BE-1).
- On success: the response includes a fresh `user` object (confirmed in `AuthResponse` — refresh returns the same shape as login) — use it directly, there's no separate "get current user" call needed since no such endpoint exists.
- On failure (no valid cookie, expired): leave the user unauthenticated, no visible error — this is the normal "not logged in" case, not a fault.
- Set `isBootstrapping = false` either way. `ProtectedRoute` (AUTH-4) must wait for this to resolve before deciding to redirect to `/login`, or every hard refresh will briefly bounce a logged-in user to the login page.

**Acceptance criteria**
- A logged-in user who refreshes the page stays logged in, with no flash of the login page first.
- A logged-out user sees no error message from this silent check.
- This ticket is explicitly blocked on **BE-1** — document that dependency on the ticket itself, don't let it get quietly built against the old body-based refresh contract.

---

## AUTH-4: ProtectedRoute and logout

**Description**
Route guard for authenticated-only pages, and the logout action.

**Component API**
```ts
interface ProtectedRouteProps { children: React.ReactNode; requiredRole?: string; }
```

**Behavior**
- While `authStore.isBootstrapping` is true, render a loading state (not a redirect).
- After bootstrap resolves: no `user` → redirect to `/login`. `requiredRole` given and not in `user.roles` → redirect to an "unauthorized" state.
- Logout calls `POST /api/auth/logout?userId={user.id}` — matching the **real** contract (query param, no body) rather than the old client's incorrect `{ refreshToken }` body call — then `clearSession()` and redirect to `/login`, regardless of whether the network call succeeds (don't trap a user who can't reach the server into a stuck "logged in" state).

**Acceptance criteria**
- Direct navigation to a protected URL while logged out redirects to `/login`, and back to the original URL after a successful login (standard redirect-back pattern).
- Logout clears `authStore` even if the `/logout` network call fails or times out.

---

## AUTH-5: 401 refresh-retry interceptor

**Description**
Centralized handling for an access token expiring mid-session: catch a 401, attempt one silent refresh, retry the original request once, and only then give up.

**Behavior**
- Response interceptor on `apiClient`: on `401` with `!originalRequest._retry`, mark it retried, call the refresh endpoint, update `authStore`'s in-memory access token, retry the original request with the new token.
- If the refresh itself fails: `clearSession()` and redirect to `/login` — this is the "your session really is over" case.
- This is the same pattern the old client's `utils/api.js` already implemented reasonably well — the new version differs only in where the tokens live (memory + cookie, not `localStorage`) and needs the refresh call to rely on the cookie rather than a stored refresh token string.

**Acceptance criteria**
- A request that hits a 401 due to an expired access token succeeds transparently after one retry, with no visible interruption to the user.
- A request that 401s even after a refresh attempt (refresh token also invalid/expired) logs the user out cleanly rather than retrying in a loop.

---

## AUTH-6: Hardening

**Description**
- Surface the rate-limiting behavior described in the original auth design (5 login attempts / 15 min, 3 registrations / hour) if the backend enforces it with a distinguishable error — confirm the actual error shape when this ticket is picked up, since it wasn't visible in the controller code reviewed here.
- Full keyboard navigation and screen-reader labeling on both forms.
- Password field has a visible show/hide toggle (usability, not explicitly in the original mockup but a near-universal expectation for a password input).

**Acceptance criteria**
- Axe (or equivalent) scan passes on both Login and Register with no critical/serious violations.

---

## AUTH-8: E2E functional test — auth journey

**Description**
Playwright flow (`e2e` project) through the real login/register/session/logout UI, network intercepted by MSW-0's handlers — no real backend involved.

**Journey covered**
1. Register with valid details → lands authenticated in the app (per AUTH-2, register auto-logs-in).
2. Log out → redirected to `/login`, protected routes now redirect there too.
3. Log in with valid credentials → lands back in the app.
4. Log in with invalid credentials (MSW returns a failure response) → inline error shown, stays on `/login`.
5. Reload the page while "logged in" (MSW's refresh handler returns a valid session) → still authenticated, no flash of the login page (AUTH-3's bootstrap).
6. Simulate an expired session (MSW's refresh handler returns a failure) → user is redirected to `/login`, `authStore` is cleared.
7. Navigate directly to a protected URL while logged out → redirected to `/login`; after logging in, lands back on the originally requested URL.

**Acceptance criteria**
- All 7 steps pass with zero real network calls (verified via MSW-0's network-log check).
- No `sleep`/arbitrary waits — assertions wait on visible auth state, not timers.

---

## AUTH-7: QA / acceptance checklist

- [ ] Login, register, logout, and session-restore-on-refresh all verified against a real running backend (not mocked) — this is a separate, manual pass; AUTH-8's E2E suite is MSW-mocked and doesn't substitute for it.
- [ ] Confirmed `/api/auth/logout` is called with the correct contract (query param, not body).
- [ ] Confirmed no token of any kind is ever written to `localStorage`/`sessionStorage`.
- [ ] BE-1 and BE-2 status checked — if BE-1 hasn't shipped, AUTH-3/AUTH-5 are working against a temporary fallback, not the final contract; don't let that temporary version go unflagged.
- [ ] AUTH-8's E2E suite passes in CI.

---

## FEED-0: Types and data hooks scaffold

**Description**
Shared types and TanStack Query hooks for posts, comments, groups, and hashtags — the foundation for FEED-1 through FEED-7.

**Deliverables**
`src/features/feed/types.ts`, typed against the real DTOs documented above (`Post`, `Comment`, `Group`, `GroupMember`, `Hashtag`).

Hooks in `src/features/feed/hooks/`, each wrapping `useQuery`/`useInfiniteQuery`/`useMutation` against the real endpoints:
- `usePersonalFeed()` → `GET /api/posts/feed`, infinite query
- `useGroupFeed(groupId)` → `GET /api/posts/group/{groupId}`, infinite query
- `useTrendingHashtags()` → `GET /api/hashtags/trending`
- `usePostsByHashtag(tag)` → `GET /api/posts/hashtag/{tag}`
- `useActiveBroadcasts()` → `GET /api/posts/broadcast`
- `useUserGroups(userId)` → `GET /api/groups/user/{userId}`
- `useLikePost()`, `useUnlikePost()`, `useDeletePost()`, `useCreatePost()` — mutations, each invalidating the relevant feed query on success

**Acceptance criteria**
- Every hook returns TanStack Query's native `{ data, isLoading, isError, ... }` shape — no custom wrapping that hides it (per `CLAUDE.md`'s data layer convention).
- Pagination hooks use `useInfiniteQuery` with `getNextPageParam` derived from Spring's `Page` response (`last`, `number`, `totalPages`).

---

## FEED-1: Feed + PostCard (real)

**Description**
Replaces HF-3's mock-backed `Feed`/`PostCard` with real data via `usePersonalFeed()` / `useGroupFeed()`.

**Behavior**
- Infinite scroll or "load more" (match whichever pattern HF-3 shipped with) driven by `useInfiniteQuery`, not manual `page` state (the old `SocialFeed.jsx` tracked `page`/`hasMore` by hand — TanStack Query does this natively).
- Like/unlike via `useLikePost()`/`useUnlikePost()` mutations with optimistic updates (increment/decrement `likeCount` and flip `isLikedByCurrentUser` immediately, roll back on error).
- Delete via `useDeletePost()`, only shown for the current user's own posts (`post.userId === currentUser.id`).

**Acceptance criteria**
- Feed reflects real posts from the backend, paginates correctly, and an optimistic like that fails rolls back visibly (not silently stuck in the wrong state).
- Deleting a post removes it from the visible list without a full refetch.

---

## FEED-2: CommentSection (real)

**Description**
Wires the comment thread to `POST`/`GET /api/posts/{postId}/comments`, delete and like-comment endpoints.

**Acceptance criteria**
- Adding a comment updates `commentCount` on the parent post optimistically.
- Deleting a comment (own comments only) removes it immediately.

---

## FEED-3: CreatePostForm (real)

**Description**
Post composer wired to `POST /api/posts`.

**Behavior**
- Fields map directly to `CreatePostRequest`: content (required, max 5000 chars), optional location, optional `sportId`, optional `groupId` (set when posting from within a group), `visibility` (public/friends/private).
- Not building broadcast creation UI in this ticket — `postType: GROUP_BROADCAST` and `broadcastEndTime` are set by FEED-7's "create broadcast" flow (owner/admin only), not the general composer.

**Acceptance criteria**
- Successful post creation prepends the new post to the current feed view without a full refetch.
- Character limit is enforced client-side and matches the server's actual limit (5000).

---

## FEED-4: Group switching (real)

**Description**
Replaces the old `GroupContext`'s manual `fetchUserGroups` with `useUserGroups(currentUser.id)`, and moves "which space is currently selected" (personal feed vs. a specific group) into UI-only Zustand state — it's a selection, not fetched data, so it doesn't belong in TanStack Query.

**Acceptance criteria**
- Switching the selected group updates the feed view (via FEED-1's `useGroupFeed`) without a page reload.
- The groups list itself updates automatically if the user joins/leaves a group elsewhere in the app (TanStack Query cache invalidation, not a manual refetch call).

---

## FEED-5: CreateGroupModal + JoinGroupModal (real)

**Description**
Wires group creation (`POST /api/groups`) and join requests (`POST /api/groups/join-requests`) to the real endpoints.

**Acceptance criteria**
- Creating a group adds it to the user's group list immediately (cache update or invalidation) and can be selected right away.
- A join request shows a clear pending state until accepted/declined (no polling required for this ticket — a manual refresh or the requester revisiting the page is acceptable for v1).

---

## FEED-6: TrendingHashtags (real)

**Description**
Replaces HF-5's mock version with `useTrendingHashtags()`. No UI change from HF-5's spec — this is purely swapping the data source behind the same component.

**Acceptance criteria**
- Clicking a hashtag navigates to a real filtered view via `usePostsByHashtag(tag)`, not just a `sendPrompt`-style stub.

---

## FEED-7: GroupBroadcasts (real)

**Description**
Replaces HF-6's mock version with `useActiveBroadcasts()`. Also adds the owner/admin-only "create broadcast" action referenced in the original app concept (group owners/admins can broadcast to members) — this didn't exist in the Home Feed mockup's scope but is the natural real-data counterpart, using `CreatePostRequest` with `postType: GROUP_BROADCAST` and an optional `broadcastEndTime` (defaults server-side to now + 24h if omitted).

**Acceptance criteria**
- Only group owners/admins (check via `GET /api/groups/{groupId}/permissions/is-admin` or `is-owner`) see the "create broadcast" action.
- Expired broadcasts (`broadcastEndTime` in the past) don't appear in `useActiveBroadcasts()` — confirm this filtering happens server-side (per the endpoint name) rather than needing a client-side filter too.

---

## FEED-8: Hardening

- Loading states: skeleton or spinner per component while `isLoading`, not a blank screen.
- Error states: a retry affordance when `isError`, not a silent empty list (a failed fetch and a genuinely empty feed must look different to the user).
- Empty states inherited from HF-3/HF-5/HF-6's original specs still apply — a real empty feed should look identical to the mock version's empty state.

## FEED-10: E2E functional test — feed/groups journey

**Description**
Playwright flow (`e2e` project) through the real feed and group UI, network intercepted by MSW-0's handlers.

**Journey covered**
1. Load the personal feed → posts render, pagination ("load more" or infinite scroll per FEED-1's shipped pattern) works with a multi-page MSW fixture.
2. Like a post → optimistic update shows immediately; unlike reverts it.
3. Add a comment → comment appears, `commentCount` increments.
4. Create a post → appears at the top of the feed without a full reload.
5. Switch to a group's feed via the group switcher → feed content changes to that group's posts (MSW returns a distinct fixture per group).
6. Create a group → new group appears in the switcher and can be selected immediately.
7. View Trending Hashtags and Group Broadcasts blocks → both render from their respective MSW fixtures; an expired-broadcast fixture confirms it's excluded from the visible list.
8. As a non-admin fixture user, confirm the "create broadcast" action (FEED-7) is not shown; as an admin fixture user, confirm it is.

**Acceptance criteria**
- All steps pass with zero real network calls.
- Covers both the "happy path" and at least one MSW-simulated error response (e.g. a failed post creation) to confirm FEED-8's error states actually render.

---

## FEED-9: QA / acceptance checklist

- [ ] Every mock data hook from Home Feed (HF-3, HF-5, HF-6) has been swapped for its real counterpart with no visible UI regression.
- [ ] Pagination, optimistic likes, and comment counts verified against a real backend with more than one page of data — this is a separate, manual pass; FEED-10's E2E suite is MSW-mocked and doesn't substitute for it.
- [ ] Broadcast expiry and owner/admin-only broadcast creation verified with a non-admin test account (should not see the create action).
- [ ] FEED-10's E2E suite passes in CI.

---

## Out of scope (this epic)

- Sport switcher real data (blocked on the separate `SportController` backend ticket, tracked in `sporthub-home-feed-tickets.md`).
- Matches/tournaments (no backend module exists at all).
- OAuth2 social login (Google/Facebook) — scaffolded server-side per the auth docs but not verified in this review; would need its own ticket if prioritized.
- Forgot/reset password real functionality — `forgot-password` is currently a non-functional placeholder server-side; wiring the client to it now would build UI against an endpoint that does nothing.
- Group invitations, pinned posts, and ownership transfer — real endpoints exist but weren't part of the Home Feed mockup; worth their own epic if the Groups page gets scoped next.

## Open questions

1. Has BE-1 (httpOnly refresh cookie) shipped by the time frontend work starts? AUTH-3 and AUTH-5 are written against it; if it's not ready, they need a documented temporary fallback rather than silently reverting to body-based tokens.
2. What does a rate-limit error actually look like from this backend (status code, body)? Referenced in AUTH-6 but not confirmed against real controller behavior.
3. Should `/api/auth/logout`'s security gap (BE-2) block this epic, or ship in parallel? Recommend fixing before this epic's logout ticket (AUTH-4) goes to production, even if frontend work starts against the current contract.
