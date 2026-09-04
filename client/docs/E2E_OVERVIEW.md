# E2E Overview

Reference doc for this client's Playwright test suite — how the mock backend starts/stops, what
fixtures exist, and a full catalog of every test case with anything non-obvious flagged. See
`client/CLAUDE.md`'s testing convention for how this fits with the other three test layers
(unit/component, Storybook, visual regression).

**Related docs:** `MSW-1_STANDALONE_MOCK_SERVER.md` (the mock server's design/build history — this doc
is the living reference, that one is the point-in-time implementation record), `AUTH-8_E2E_AUTH_JOURNEY.md`,
`FEED-10_E2E_FEED_GROUPS_JOURNEY.md`, `FEED-12_COMMENT_MODAL_DEEP_LINK.md` (the `/posts/:postId` route),
`HF-11_E2E_HOME_FEED_JOURNEY.md`, `HF-10a/b` (visual-regression harness), `GRP-3_MEMBERS_TAB.md`
(new `group-members.spec.ts` + the first Groups-page block in `a11y.spec.ts`), `GRP-4_INVITE_FRIEND_REAL.md`
(replaces `group-members.spec.ts`'s step 3 with a real search + invite), `GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`
(new `group-invitations.spec.ts` — the merged approval queue + the Invitations section's accept/reject),
`GRP-8_INVITATION_LIFECYCLE_POLISH.md` (extends `group-invitations.spec.ts` with 2 new tests + a new
`seed-join-requests` admin route), `services/chat/docs/MVP/CHAT-10_E2E_MSW_HANDLERS.md` (new
`group-chat.spec.ts`/`direct-chat.spec.ts`, `mocks/handlers/chat.ts`, `mocks/fakeChatSocket.ts` — real,
MSW-backed e2e coverage for the two chat surfaces CHAT-8/CHAT-9 wired up, including the WebSocket-vs-MSW
resolution `friends-journey.spec.ts` had flagged as still open), `CLIENT-SESSION-1_SESSION_UI.md` (new
`matches-journey.spec.ts`, `mocks/handlers/{locations,sessions}.ts` — the real `/matches` page's
create/list/join/leave/cancel journey), `CLIENT-SESSION-4_INVITE_APPROVAL.md` (extends
`matches-journey.spec.ts` with invite/auto-approve create-form fields and a new approval-queue
step 7), `CLIENT-SESSION-5_FAVORITE_LOCATIONS.md` (extends `matches-journey.spec.ts` with a new
favorites round-trip step 8, `mocks/handlers/locations.ts`'s favorite/unfavorite/favorites-list
handlers), `CLIENT-SESSION-6_STANDALONE_DISCOVERY.md` (splits `/matches` into a Discover grid +
collapsible "My sessions" panel; extends `matches-journey.spec.ts` with steps 9-10, new
`mocks/handlers/sessions.ts` `GET /sessions/discover`/`GET /sessions/joined` handlers, and a new
`mockDiscoverableSession` fixture), `CLIENT-SESSION-8_SESSION_COMMENTS.md` (new inline "Discussion"
section + heart button in `SessionDetailModal`; extends `matches-journey.spec.ts` with steps
3b/3c, new `mocks/handlers/sessions.ts` comment + like endpoints, a `deleteSessionCommentIfPresent`
cross-store fallback for `mocks/handlers/feed.ts`'s shared `DELETE /api/posts/comments/:commentId`,
and a new cross-domain `PostService.getSessionPostLikeInfo` batch method backend-side),
`CLIENT-SESSION-9_PARTICIPATION_ACTION.md` (session cards get their own Join/Accept/Cancel/Leave
button, derived from `session.callerParticipation`; extends `matches-journey.spec.ts` with a new
step 5b and disambiguates several existing steps' card-click selectors, `mocks/handlers/sessions.ts`
now attaches `callerParticipation` to every session-returning response; same-day follow-up makes
the Upcoming rail's "View details" open `SessionDetailModal` in place instead of navigating to
`/matches`, rewriting `home-feed-journey.spec.ts` step 6).

---

## 1. Two Playwright projects, one config

`playwright.config.ts` defines two projects sharing one install:

| Project | `testDir` | Purpose | Run with |
|---|---|---|---|
| `e2e` | `e2e/flows/` | Functional user journeys | `pnpm e2e` |
| `visual-regression` | `e2e/visual/` | Screenshot diffing against committed baselines | `pnpm test:visual` |

Both run headed locally (visible browser) and headless in CI (`headless: !!process.env.CI`), both use
`fullyParallel: true` (default worker count ≈ half your CPU cores — this project has run with 8
workers locally), and both depend on the same mock backend described below.

---

## 2. The mock backend — how it starts and stops

Network mocking is **not** a browser Service Worker (that was the old MSW-0-era design; replaced by
MSW-1, see `MSW-1_STANDALONE_MOCK_SERVER.md` for why). It's a real, standalone Node HTTP server
(`e2e/mocks/mockServer.ts`) that Playwright starts once, before any test runs, and keeps alive for the
whole suite.

### Startup sequence

`playwright.config.ts`'s `webServer` is an array — Playwright spawns each entry as a child process and
polls its `url` until it responds, before running any test:

```ts
webServer: [
  { command: 'node e2e/mocks/mockServer.ts', url: `${MOCK_SERVER_URL}/__mock/health`, reuseExistingServer: !process.env.CI },
  { command: 'pnpm exec vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI,
    env: { VITE_API_PROXY_TARGET: MOCK_SERVER_URL } },
],
```

(Calls `vite` directly rather than `pnpm dev -- --port ...` — on this setup pnpm doesn't strip the `--`
separator before forwarding to the `dev` script, so Vite received a literal `"--"` argument and
silently fell back to its default port 5173, ignoring `--port` entirely. `pnpm exec vite` sidesteps
the ambiguity; `package.json`'s `dev` script is just `vite` with no extra flags, so nothing is lost.)

1. **Mock server** (`e2e/mocks/mockServer.ts`) — plain `node:http` `createServer` + `.listen()`, no
   framework. Readiness probe: `GET /__mock/health` → `{"status":"ok"}`, answered the instant
   `.listen()`'s callback fires.
2. **Vite dev server** (`pnpm dev`) — same dev server a developer would run by hand, except on its own
   dedicated port (**5174**, not 5173 — deliberately distinct from plain `pnpm dev` so this
   Playwright-managed instance can never collide with a developer's own concurrent dev session), and
   Playwright passes it `VITE_API_PROXY_TARGET` pointing at the mock server. `vite.config.ts` reads
   that env var for its `/api` proxy target, falling back to `http://localhost:8080` (the real
   backend) when unset — so a bare `pnpm dev` run outside Playwright is completely unaffected by any
   of this. **CHAT-10:**
   also passes `VITE_CHAT_PROXY_TARGET`, the equivalent for the separate `/api/chat` proxy entry
   (chat is its own backend, `services/chat`, normally `:8081` — without this it silently targeted a
   real chat service that doesn't exist in CI/most local setups, and every `/api/chat/**` e2e request
   404'd or connection-refused). Both env vars point at the **same** mock server process — the chat
   MSW handlers (`handlers/chat.ts`) are matched against bare paths (`/conversations/...`), the same
   prefix-stripped shape `vite.config.ts`'s `/api/chat` rewrite already produces for the real service,
   so no separate mock-server instance or route-prefix special-casing is needed.

`reuseExistingServer: !process.env.CI` — locally, if something is already answering on that URL (a
mock server you started by hand, or a leftover process from an earlier interrupted run), Playwright
reuses it instead of spawning a new one. In CI this is always `false`: CI always starts fresh.

**Gotcha, hit for real repeatedly (MSW-1's own verification, CLIENT-SESSION-3, CLIENT-SESSION-9,
FEED-3, GRP-2, GRP-8):** if a previous `pnpm e2e`/`pnpm dev` run gets interrupted (Ctrl+C, crashed
shell, or — in a sandboxed/background tool environment — a command timeout that moves the process to
the background without letting Playwright's own teardown run) without its child processes dying,
`reuseExistingServer` will happily reuse the stale one on the next run, including a *stale Vite
instance still proxying to the old target*. Symptom: every request 500s with a generic Vite error
page, not a mock-server JSON error, or (pre-fix) a login that inexplicably fails with "Invalid email
or password" against a stale server that never got the current run's mock state. Fix: `netstat -ano |
findstr :5174` (or `:9876` for the mock server) and kill the stragglers before re-running.

**Distinct port (5174, not 5173) + `--strictPort`:** this Playwright-managed Vite instance runs on
its own dedicated port so it can never collide with a developer's own concurrent `pnpm dev` session,
and `--strictPort` makes it fail loudly if 5174 is already taken rather than Vite's default behavior
of silently trying 5175/5176/... next — which used to cause Playwright to poll the *wrong* server's
health check while a stale process sat on the port it actually wanted. This does **not** eliminate
the stale-process gotcha above (an orphaned process from a previous run still gets reused by
`reuseExistingServer` on the *same* dedicated port) — it only removes port drift and collision with a
real dev session as contributing factors.

### Request handling

The mock server reuses the **exact same** `handlers` array every consumer imports
(`e2e/mocks/handlers/index.ts`) via `msw`'s own exported `getResponse(handlers, request, { baseUrl })`
— the same matching/resolution engine `setupWorker`/`setupServer` use internally, just driven directly
against a real Node `Request` built from the incoming HTTP request. No new dependency (`getResponse`
ships in the `msw` package this project already depends on).

- `/__mock/**` paths are intercepted before `getResponse` — this is the **admin API** (below).
- Everything else is matched against `handlers`; an unmatched `/api/**` path 404s (there's no "real
  backend to bypass to" during e2e runs — Vite only proxies `/api` to the mock server for these two
  projects).
- `Response.headers.getSetCookie()` is used specifically for `Set-Cookie` — iterating `Headers`
  normally combines multiple `Set-Cookie` entries into one comma-joined string, which is invalid for
  cookies (commas are legal inside a single cookie's `Expires` attribute).

### Session isolation

One server process serves every test/worker concurrently. Without isolation, two tests running at the
same time would corrupt each other's state (`feed.ts`'s `postsState` etc.) — this was a real design gap
found during MSW-1, not something the original ticket anticipated.

**How it works:** `e2e/mocks/test.ts`'s custom `test` fixture generates a unique `mockSessionId` per
test (`testInfo.testId` + `testInfo.repeatEachIndex`) and attaches it via
`context.setExtraHTTPHeaders({ 'x-e2e-session-id': id })` **before** `page` is created — so even the
test's very first request carries it. Every stateful handler
(`e2e/mocks/handlers/{feed,groups,sport}.ts`) resolves its working data through
`e2e/mocks/sessionStore.ts`'s `createSessionStore()` (a lazily-initialized `Map<sessionId, T>`) keyed
by that header, instead of a bare module-level `let`.

The session is reset server-side (`POST /__mock/sessions/:id/reset`) after each test automatically —
bounds memory over a long run and guarantees no cross-test bleed even if two tests happen to reuse a
similar-looking id (they can't; ids are unique per test already, this is defense in depth).

**Import for any new stateful mock handler:** use `createSessionStore`, never a module-level `let` — a
bare `let` will work fine in isolation and then silently corrupt under parallel workers, exactly the
class of bug this section exists to prevent.

### Admin API (`/__mock/*`)

Test-side code (mostly `fixtures.ts`) drives the mock server directly via Playwright's `request`
fixture or a plain `fetch()` — no more browser-JS injection.

| Route | Method | Purpose |
|---|---|---|
| `/__mock/health` | GET | Playwright's readiness probe |
| `/__mock/sessions/:id/reset` | POST | Reset one session's state + overrides + request log to defaults |
| `/__mock/sessions/:id/requests` | GET | The session's request log (`{method, path, timestamp}[]`) — proves a request actually reached the mock server |
| `/__mock/sessions/:id/seed-paginated-feed` | POST | Replace the session's feed with the 21-post pagination fixture (`paginatedFeedFixture.ts`) |
| `/__mock/sessions/:id/override/:name` | POST | Flip one `SessionOverrides` flag on (see `overrides.ts`) |

Override names: `feedError`, `feedEmpty`, `trendingError`, `broadcastsError`, `groupsError`,
`refreshExpired`, `sportProfilesEmpty`, `createPostFailOnce` (this last one self-consumes — only the
*next* `POST /posts` for that session fails, then reverts to normal).

### Shutdown

Playwright owns the child processes it spawned and terminates them when the run ends (finished, error,
or Ctrl+C). `mockServer.ts` has no custom signal handler — an unhandled `SIGTERM` just kills the
process, which is fine here: all state is in-memory `Map`s with nothing to drain (no DB connections, no
open files).

---

## 3. Directory structure

```
e2e/
  flows/                     # `e2e` project specs
    smoke.spec.ts
    home-feed-journey.spec.ts
    a11y.spec.ts
    auth-journey.spec.ts
    feed-groups-journey.spec.ts # FEED-10, CLIENT-MODAL-1
    group-settings.spec.ts
    group-members.spec.ts
    group-invitations.spec.ts
    friends-journey.spec.ts
    msw-setup.spec.ts
    post-deep-link.spec.ts
    group-chat.spec.ts        # CHAT-10
    direct-chat.spec.ts       # CHAT-10
    matches-journey.spec.ts   # CLIENT-SESSION-1/CLIENT-SESSION-4/CLIENT-SESSION-5/CLIENT-SESSION-6/CLIENT-SESSION-8/CLIENT-SESSION-9
    notification-bell.spec.ts # CLIENT-NOTIF-1, CLIENT-NOTIF-5
    admin-route-guard.spec.ts # ADMIN-1, ADMIN-4
    admin-sports.spec.ts      # ADMIN-2, ADMIN-4
    profile-journey.spec.ts   # PROFILE-8
  visual/                    # `visual-regression` project specs
    app-home-feed.spec.ts
    app-groups.spec.ts        # GRP-10
    app-session-detail-modal.spec.ts  # CLIENT-SESSION-12
    app-create-session-modal.spec.ts  # CLIENT-SESSION-12
    app-notification-bell.spec.ts  # CLIENT-NOTIF-2
    app-profile.spec.ts       # PROFILE-7
    __screenshots__/         # committed baselines (Linux-rendered, see §6)
  mocks/
    mockServer.ts            # the standalone Node HTTP server
    mockServerConfig.ts       # shared port/URL/header-name constants
    sessionStore.ts           # generic per-session state map
    overrides.ts              # per-session error/empty/expired flags
    paginatedFeedFixture.ts   # the 21-post pagination fixture builder
    test.ts                   # custom `test` — session header wiring
    fixtures.ts                # shared mock data + spec-facing helper functions
    fakeChatSocket.ts          # CHAT-10: fake in-page WebSocket for chat's real-time push
    handlers/
      index.ts                 # combines all handler arrays
      auth.ts
      feed.ts
      groups.ts
      sport.ts
      friends.ts
      chat.ts                   # CHAT-10 — a separate backend (services/chat), bare paths, no ApiResponse<T> envelope
      locations.ts               # CLIENT-SESSION-1
      sessions.ts                # CLIENT-SESSION-1
      notifications.ts           # CLIENT-NOTIF-1, CLIENT-NOTIF-5
```

---

## 4. Commands

| Command | What it does |
|---|---|
| `pnpm e2e` | Runs the `e2e` project (all specs in `e2e/flows/`) |
| `pnpm e2e <substring>` | Filters to spec files matching the substring, e.g. `pnpm e2e auth-journey` |
| `pnpm test:visual` | Runs the `visual-regression` project |
| `pnpm exec playwright test --project=e2e --repeat-each=N` | Repeats every test N times — the standard way to verify something flake-free (used to confirm MSW-1's reload-persistence fix at N=10) |
| `pnpm exec playwright test --project=e2e --grep "<pattern>"` | Filters by test title regex, combinable with `--repeat-each` |
| `pnpm exec playwright test --project=visual-regression --update-snapshots` | Regenerates baselines locally (don't commit Windows-rendered ones — see §6) |

---

## 5. Shared fixtures reference (`e2e/mocks/fixtures.ts`)

The single logged-in test user, unless a spec explicitly overrides via an admin-API helper:

| Fixture | Value | Notes |
|---|---|---|
| `mockUser` | Jordan Lee, `jordan@example.com` | `id: '11111111-...'` |
| `mockAdminUser` | Alex Admin, `admin@example.com` | **ADMIN-1:** `id: '22222222-...'`, `roles: ['USER', 'ADMIN']` — the only fixture holding ADMIN. Deliberately holds USER too, matching how a real admin is provisioned (registration grants USER, ADMIN is added on top) |
| `mockPassword` | `password123` | Shared by both accounts — they differ only by email and roles |
| `mockSportProfiles` | Badminton(1)/Pickleball(3) | **SPORT-3:** every sport the real MVP catalog serves (A6) — the old "3-sport cap" (Soccer/Basketball/Tennis) is no longer representable at all with only 2 real sports. **SPORT-5:** specs no longer assert `aria-disabled` for this state; they assert the dialog it now opens. The fixture still supplies the "every available sport already held" condition both depend on. **PROFILE-8:** Badminton is the only one with an attribute schema (`racketBrand`/"Racket brand", STRING — see `defaultAttributeSchemas()` in `sport.ts`); `PUT /api/sports/profiles/:profileId` (new this ticket) merges a saved `attributes` object into the existing one rather than replacing it, mirroring the real service |

Posts (all owned by `mockUser` unless noted) — `sportId` 1 = Badminton, 3 = Pickleball
(SPORT-3 — was 5 = Soccer/6 = Basketball before the real catalog shrank to 2 sports, A6):

| Fixture | id | Type | Notes |
|---|---|---|---|
| `mockPost` | 1 | `USER_FEED` | "Great match today! #fridayrun" — `likeCount: 3`, `commentCount: 1` — Badminton |
| `mockGroupPost` | 2 | `GROUP_POST` | belongs to `mockGroup` — Badminton |
| `mockBroadcastPost` | 3 | `GROUP_BROADCAST` | belongs to `mockGroup`, `broadcastEndTime: hoursFromNow(24)` (always active) |
| `mockBasketballPost` | 4 | `USER_FEED` | owned by **Priya Shah** (a friend, not `mockUser`) — the "no delete menu on someone else's post" case — Pickleball (name unchanged since SPORT-3, only its sportId/sportName fields did) |
| `mockExpiredBroadcastPost` | 5 | `GROUP_BROADCAST` | belongs to `mockGroup`, `broadcastEndTime: hoursAgo(24)` — proves the expiry filter is real |

Groups:

| Fixture | id | sportId | `currentUserRole` | Notes |
|---|---|---|---|---|
| `mockGroup` | 1 | 1 (Badminton) | `group_member` | "Friday Night Football" (display name unrelated to real sportId, unchanged by SPORT-3) |
| `mockOwnedGroup` | 3 | 3 (Pickleball) | `group_owner` | "Weekend Tennis Ladder" — the owner/admin broadcast-toggle fixture, also GRP-2's Settings-tab fixture |
| `mockPublicGroup` | 2 | 3 (Pickleball) | n/a (not joined) | "Riverside Hoopers" — the "request to join" fixture. **SPORT-3:** now the same sport as `mockOwnedGroup` (only 2 real sports exist) — harmless, no test examines both groups' sports together |

`mockHashtag`: `fridayrun`, `usageCount: 12`. `mockComment`: one root comment on `mockPost` (matches its
`commentCount: 1`). `mockGroupSettings`: settings for `mockOwnedGroup` (`groupTypeName: 'DEFAULT'`,
all three toggles off except `allowMemberPosts`) — the only group with a `groupSettingsState` entry in
`groups.ts`'s handler session (any other groupId 404s `GET/PUT .../settings`). `mockGroupInfo`:
rules/schedule for `mockOwnedGroup` (both `null` by default — empty-state fixture), same
one-group-only keying as `mockGroupSettings` (`groupInfoState`, `GET .../info`) — written via
`PUT /api/groups/:groupId` (`groups.ts`'s handler also had no coverage for this endpoint at all
before GRP-2 added rules/schedule; it now updates both `userGroupsState` and `groupInfoState`).
`mockSentInvitation`: an in-flight invitation to "Robin Park" for `mockOwnedGroup`, `pending_owner`.
GRP-4 adds a stateful `POST /api/groups/:groupId/invitations` to `groups.ts` — appends to
`sentInvitationsState`, 400s "User is already a member of this group" for an existing member,
returns the existing invitation idempotently (201) for a re-invite; the not-friends/
`allowMemberInvites`-off 400s aren't simulated since the client already filters non-friend results
out before an invite is reachable.

GRP-7 adds two more invitation fixtures, kept deliberately separate from `mockSentInvitation`'s state:
`mockGroupInvitation` — a `pending_owner` invitation for `mockOwnedGroup`, sent by **Sam Ito** (the
group's admin, `mockGroupMembers[1]`), not the test user — post-B11, an owner/admin's own invite
skips `pending_owner` entirely, so the only invitation that can realistically sit in the
owner-approval queue is one a peer member sent. Backs `groupInvitationsState`/`GET
.../invitations` (the owner/admin's merged-queue source, distinct from `sentInvitationsState`/`GET
.../invitations/sent`). `mockReceivedInvitation` — a `pending_user` invitation addressed to the
test user for `mockPublicGroup` ("Riverside Hoopers", Pickleball, not yet joined), from **Priya
Shah**. Backs `userPendingInvitationsState`/`GET /invitations/user` — `GroupDiscoveryPanel`'s
"Invitations" section. Accepting it (`PUT .../accept`) synthesizes a full `Group` from the matching
`publicGroupsState` entry and prepends it to `userGroupsState`, same "mutate state so a refetch
reflects it" pattern as every other stateful handler here; approving/declining
`mockGroupInvitation` (`PUT .../approve` or `.../decline`) only removes it from the queue — it does
**not** add a member, matching real backend semantics (approving only moves `pending_owner` →
`pending_user`; membership needs the invitee's own accept). Real backend B11 short-circuits
(approve/accept jumping straight to `accepted` when the other flow already has a pending row for the
same person) aren't simulated here, same precedent as the not-friends/`allowMemberInvites` 400s
above.

**Timestamps are never hardcoded** — `hoursAgo`/`hoursFromNow` (`src/shared/lib/mockClock.ts`) compute
relative to load time. A hardcoded broadcast expiry date drifting into the past (and silently breaking
the "active" assumption) is a real bug this project has hit before — don't reintroduce it.

Friends (FRIEND-1) — `friends.ts`'s own small `KNOWN_USERS` directory resolves `GET /users/:userId`
and `GET /users/search` for every id these fixtures reference, plus the Add-mode-only stranger below.
**SPORT-11:** each `KNOWN_USERS` entry now carries `activeSportIds` (U15 — sport ids matching
`sport.ts`'s `mockSportCatalog`, Badminton=1/Pickleball=3), and `GET /users/:userId` returns it on
the `UserInfoResponse` body — that field, not the removed `GET /api/sports/profiles/user/:userId`,
is what `FriendProfilePanel`'s sport-pill row is sourced from now (`useUserInfo` runs for every
selection, known friends included). The caller's own sport reads moved to the caller-scoped
`GET /api/sports/profiles` (A22) — `sport.ts`'s handler dropped its `/user/:userId` path segment.

| Fixture | id | Notes |
|---|---|---|
| `mockFriend` | `priya-shah` | Same person as `mockComment`'s commenter — an accepted friend, renders under Offline (Online always empty, no presence system exists). GRP-4 reuses it as `group-members.spec.ts`'s invitable-friend fixture — not a member/not already invited to `mockOwnedGroup` |
| `mockIncomingFriendRequest` | `req-incoming-1`, sender `hana-kim` | Sent TO the test user — Friend Requests row + the profile panel's Accept/Decline action bar |
| `mockSentFriendRequest` | `req-outgoing-1`, receiver `diego-alvarez` | Sent BY the test user — Friend Requests row + the profile panel's "Waiting for response" status and "Cancel request" button (CLIENT-NOTIF-5) |
| `mockSearchResultUser` | `owen-clarke`, `friendshipStatus: 'NONE'` | Only reachable via Add mode's directory search, never in the default friend list |

`mockMyProfile` (**PROFILE-7**): the test user's own full `UserResponse` (`fixtures.ts`) — `GET
/api/users/:userId` special-cases `userId === mockUser.id` to return this instead of resolving
through `KNOWN_USERS`'s narrow `FriendUser` shape, since `/profile`'s `useMyProfile`/`ProfileHeader`/
`EditProfileModal` need the full row for the caller's own id. **PROFILE-8** made this session-scoped
(`myProfileState`, seeded from `mockMyProfile`) and added `PUT /api/users/:userId/profile`, so an
Edit Profile save actually changes what the next `GET` returns — PROFILE-7 never needed this (its
baselines only ever exercised a clean load, no save).

---

## 6. Full test case catalog

### `e2e/flows/smoke.spec.ts`

| Test | What it checks | Notes |
|---|---|---|
| `shell renders and NavTabs navigate between routes` | Seeds session → Home Feed heading + "SportHub" title visible → click Friends tab → Friends heading + `/friends` URL → click Home tab → back to Home Feed | Baseline shell smoke test, no edge cases |

### `e2e/flows/home-feed-journey.spec.ts` (HF-11, one `test()`, 8 steps)

Uses the **default** 3-post fixture set (`mockPost`/`mockGroupPost`/`mockBasketballPost`) — no seeding
helpers called.

| Step | What it checks | Notes |
|---|---|---|
| 1. load | Shell/switcher/feed/all 3 rail blocks render; 3 articles, **4** match CTAs, 1 trending row, 1 broadcast row | **CLIENT-SESSION-12:** rose from 3 — `mockInvitedSession`/`mockRequestedSession` (new fixtures, Badminton, `mockGroup`-linked) also count as "upcoming" via `useUpcomingMatches`, capped at `UpcomingMatches`' own `maxVisible=4` (5 true upcoming sessions exist, one is pushed below the fold) |
| 2. Pickleball pill | Feed filters to 1 (Priya Shah's post); Upcoming Matches filters to **2** (`mockSession` + `mockOwnedGroupSession`, both Pickleball); Trending/Broadcasts **unchanged** | **SPORT-3:** renamed from "Basketball pill" — with only 2 real sports, `mockSession`/`mockOwnedGroupSession` now share Pickleball, so the matches count is 2, not 1 (the old "one session per sport" 1:1:1 split isn't representable). Trending/broadcasts are deliberately global, not sport-scoped (HF-5/HF-6 resolved open question). Unaffected by CLIENT-SESSION-12 — both new sessions are Badminton |
| 3. "All" | Filters clear back to 3 articles, **4** match CTAs | CLIENT-SESSION-12, same as step 1 |
| 4. like toggle | `likeCount` 3→4→3, `aria-pressed` flips | Optimistic — no network wait asserted |
| 5. hashtag click | Opens `HashtagPostsModal` with 2 matching posts (`mockPost`+`mockGroupPost`, both tagged `fridayrun`); reachable from both an inline post tag and the Trending row; Escape closes it; **no URL change** | Modal, not a route — user decision, see FEED-6's delta |
| 6. match CTA | "View details" opens `SessionDetailModal` in place, no URL change → Close returns to the rail | CLIENT-SESSION-9 (same-day follow-up): previously navigated to `/matches?session={id}`, switching the user away from Home Feed — now reuses the page's own `discoverModalData.onViewDetails`, same as clicking a card inside the Discover modal. Matches come from `mocks/handlers/sessions.ts`'s default session fixture set (CLIENT-SESSION-12: grew from 3 to 5 upcoming sessions, rail still caps display at 4) |
| 7. "Add sport" | Pill is **not** `aria-disabled`; clicking it opens `NoSportsToAddDialog` ("Nothing left to add"), dismissed with OK | **SPORT-5 reverses HF-2 here** — this step previously asserted `aria-disabled="true"`. A disabled control cannot explain itself, so the pill now always fires, re-reads the catalogue, and states the outcome. **SPORT-3:** still relies on the fixture user holding a profile for every sport the live catalog serves (2), not a numeric "3-sport cap" |
| 8. delete | "..." menu only on the caller's own post (not Priya Shah's); delete removes it, count 3→2 | |

### `e2e/flows/a11y.spec.ts` (HF-8 + AUTH-6 + GRP-3 + FRIEND-1 + PROFILE-7, several independent `test()`s)

| Test(s) | What it checks | Notes |
|---|---|---|
| `home feed @ {375,768,1280}px — no horizontal overflow` (×3) | `scrollWidth - clientWidth <= 0` | String-form `page.evaluate` — e2e tsconfig has no DOM lib |
| `home feed @ {375,768,1280}px — axe reports no critical/serious violations` (×3) | `axe-core` scan, filtered to `impact === 'critical' \| 'serious'` | Moderate/minor violations don't fail the gate |
| `sport-filtered state — axe reports no critical/serious violations` | Same axe gate after clicking Pickleball (1 article) | SPORT-3: renamed from Basketball |
| `groups page — Members tab (owner) — axe reports no critical/serious violations` | Same axe gate on the Groups page, `mockOwnedGroup` selected, Members tab active | GRP-3: the first Groups-page a11y coverage in this file — GRP-1/GRP-2 both claimed to extend this file but never actually added a Groups-page block. One check (owner role, 1280px, Members tab — the richest per-group tab) establishes a baseline rather than backfilling every tab/breakpoint retroactively |
| `friends page — friend selected — axe reports no critical/serious violations` | Same axe gate on the Friends page with `mockFriend` selected (profile + chat split, the richest state) | FRIEND-1: one check at 1280px, same "one representative state" scoping the Groups-page check above uses |
| `profile page @ {375,768,1280}px — no horizontal overflow` (×3) | Same overflow check, `/profile`'s default Posts tab | PROFILE-7: found and fixed a real overflow at 375px — see `app-profile.spec.ts`'s own entry below |
| `profile page @ {375,768,1280}px — axe reports no critical/serious violations` (×3) | Same axe gate, default Posts tab | PROFILE-7: this page's own ticket text explicitly asked for the full HF-8-shape 3-breakpoint gate, unlike Groups/Friends' single representative check |
| `profile page — Settings tab — axe reports no critical/serious violations` | Same axe gate, Settings tab active (per-sport profile editor) | PROFILE-7: one representative state, same "richer state, not a full matrix" scoping the Groups/Friends checks above use |
| `profile page — Edit Profile modal open — axe reports no critical/serious violations` | Same axe gate, `EditProfileModal` open | PROFILE-7 |
| `/login`/`/register` @ {375,768,1280}px — no horizontal overflow (×6) | Same overflow check, logged-out pages | No `seedAuthenticatedSession` — these routes aren't behind `ProtectedRoute` |
| `/login`/`/register` @ {375,768,1280}px — axe violations (×6) | Same axe gate | |
| `/login: Tab reaches every control in order` | Explicit Tab sequence: Email → Password → "Show password" toggle → Log in → "Create an account" link | `getByLabel('Password', { exact: true })` — substring matching would collide with the toggle's `aria-label="Show password"` |
| `/register: Tab reaches every control in order` | Email → Password → toggle → Full name → Phone (optional) → Create account → "Log in" link | |

### `e2e/flows/auth-journey.spec.ts` (AUTH-8, 3 `test()`s)

**Test 1 — `Auth journey — register, logout, login`** (steps 1-4):

| Step | What it checks | Notes |
|---|---|---|
| 1. register | Valid details → auto-login (AUTH-2), lands on Home Feed | |
| 2. log out | Redirected to `/login`; `/friends` while logged out also redirects there; bounces through `about:blank` before re-visiting `/login` | The `about:blank` bounce guarantees a genuinely fresh navigation — `goto()` to the current URL can be a same-document no-op that keeps stale redirect-back state |
| 3. log in (valid) | Lands back on `/` | |
| 4. log in (invalid) | Logs out first, then wrong password → inline `role="alert"` error, stays on `/login` | |

**Test 2 — `Auth journey — reload while logged in stays authenticated`** (step 5, **restored by MSW-1**):

| Step | What it checks | Notes |
|---|---|---|
| 5. reload while logged in | Fresh login → `page.reload()` → still shows Home Feed, still at `/` | **Could not be tested before MSW-1** — needed a real `Set-Cookie` response the browser's cookie jar actually honors, which a Service-Worker-mocked response never provided. Dedicated test (not chained onto steps 1-4) since step 4 ends logged out and every test already gets an isolated session for free. Verified flake-free at `--repeat-each=10`. |

**Test 3 — `Auth journey — expired session, then protected deep link`** (steps 6-7):

| Step | What it checks | Notes |
|---|---|---|
| 6. simulated expired session | Login, then force one 401 on `POST /api/auth/logout` via `page.route()` → AUTH-5's retry interceptor attempts a silent refresh (fails, no valid cookie) → session cleared regardless → redirected to `/login`; re-visiting `/` redirects again (not a stale render) | **Deliberately not reload-based** — an earlier reload-triggered version was unreliable even under normal, non-repeated runs (a genuine stuck state, not the MSW-1 race) |
| 7. deep link while logged out | `/friends` → redirected to `/login` → log in → redirected **back to `/friends`** | Tests the redirect-back mechanism specifically |

### `e2e/flows/feed-groups-journey.spec.ts` (FEED-10 + CLIENT-MODAL-1, one `test()` with 9 steps + 7 separate `test()`s)

Uses `seedPaginatedFeedOnNextLoad(mockSessionId)` — replaces the feed with **21 posts** before the
first fetch (index 19 = a `GROUP_POST` for `mockGroup`, index 20 = Pickleball, everything else
Badminton — SPORT-3: was Basketball/Soccer before A6 shrank the real catalog to 2 sports).
This spec destructures `mockSessionId` directly (needed by the seed/override admin calls).

**Main test — `Feed/groups journey`:**

| Step | What it checks | Notes |
|---|---|---|
| 1. load + pagination | 20 articles (page 0) → "Load more" → 21 articles, Pickleball post now visible, "Load more" button gone | Real second-page fetch, not a fixed 3-post fixture. Only clicks the button if it's still visible — `useInfiniteScrollSentinel`'s `IntersectionObserver` (200px `rootMargin`) can auto-fire the same fetch first under slow/contended rendering, a real race reproduced under parallel headless runs, not test flakiness to shrug off |
| 2. like toggle | `3→4→3` | Base `likeCount` inherited from `mockPost` by every seeded post |
| 3. add comment | Comment count `1→2`, appears in dialog | |
| 4. create post (simulated failure) | `simulateCreatePostFailOnce(mockSessionId)` first → first submit fails with error text, composer clears anyway → retry succeeds, count → 22 | FEED-10's required "at least one MSW-simulated error response" acceptance criterion |
| 5. switch to group feed | Click "Friday Night Football" (`mockGroup`) in `GroupSpaceSwitcher` → 1 article (the seeded GROUP_POST) | Scoped query — "Friday Night Football" also appears as a broadcast-rail row, an ambiguous unscoped match |
| 6. create a group | Back to "All" (group switcher) → `GroupDiscoveryPanel`'s "Create Group" button → "Sunday Runners" (no manual sport pick) → appears selected in switcher, "No posts yet for this sport." | GRP-1: `GroupSpaceSwitcher`'s own "Group options" dropdown was removed (redundant with the panel's Join/Create entry points) — the panel only renders in the "All" state, hence the extra click back. **GRP-8 delta:** step 5's group selection now also drives this page's own sport pill to Badminton (`groupsPageStore.selectGroup`'s derivation; SPORT-3: was Football before the real catalog shrank to Badminton/Pickleball) — deselecting the *group* via the group switcher's "All" leaves the *sport* pill on Badminton, so `CreateGroupModal` opens already `lockedSport`-locked to it (no `#create-group-sport` select to interact with — asserts `toHaveCount(0)` instead of `selectOption`) |
| 7. Trending + Broadcasts | 1 trending row, 1 broadcast row (expired one excluded) | Unaffected by the postsState replacement — separate handler state |
| 8. Broadcast toggle permission | Absent for `mockGroup` (member) → reset sport pill to "All" → present for `mockOwnedGroup` (owner, Pickleball) | **GRP-8 delta:** the group switcher list is sport-filtered by this page's own pill (unchanged design), which now reliably stays on Badminton from steps 5–6 — `mockOwnedGroup` ("Weekend Tennis Ladder", Pickleball) isn't reachable in that filtered list until the sport pill is explicitly reset to "All" first |
| 9. SPORT-1 sport filter | Pickleball pill → 1 article (the seeded index-20 post); back to All → 22 | SPORT-3: renamed from Basketball. Waits for Home Feed's own `<h1>` before clicking — `GroupsPage`/`HomeFeedPage` share `SportSwitcher`'s exact accessible name ("Sport filter" group), and under a slow route transition the previous page's pill can still be attached, so an unscoped click can silently land on the wrong page's button (reproduced under parallel headless runs) |

**Separate test — `zero sport profiles renders without error`:**

| Test | What it checks | Notes |
|---|---|---|
| zero sport profiles | `seedZeroSportProfilesOnNextLoad(mockSessionId)` → only "All" + "Add sport" render, 2 buttons total, no crash | SPORT-1's zero-profile edge case — can't coexist with the main journey's step 9 (fixture user holds a profile for every real sport), hence a separate test |

**Separate test — SPORT-5 catalogue freshness:**

| Test | What it checks | Notes |
|---|---|---|
| a sport activated mid-session appears on the next "Add sport" click | Hold everything → dialog → a `page.route()` override activates Squash → click again → the **picker** opens offering Squash | Drives the exact sequence that used to fail: the catalogue query is `staleTime: 0` so it refetches on mount and focus, but nothing refetched at *click* time, so a mounted, focused session never saw the new sport. Overrides `GET /api/sports` rather than mutating a fixture, because the MSW handler serves a module-level constant. Confirmed to fail with the re-read reverted |

**Separate test — SPORT-10 reactivate flow:**

| Test | What it checks | Notes |
|---|---|---|
| re-adding a soft-deleted sport shows the read-only Reactivate flow | `seedSoftDeletedSportProfileOnNextLoad(mockSessionId)` makes Pickleball soft-deleted (prev `advanced`/6y) → "Add sport" pill → picker shows "You had a Pickleball profile before", skill `advanced` + YoE both **disabled**, **Reactivate** button → click → modal closes; the muted "Reactivate Pickleball" pill goes away and Pickleball is an active pill | The picker defaults its Sport select to the only addable sport (Pickleball), which is resumable → the modal opens straight into the reactivate variant. `POST /api/sports/profiles {sportId, isResume:true}` flips the MSW row back to active. §2e: this page's `SportSwitcher` also now shows the muted Pickleball pill, hence the "Reactivate Pickleball" (button + `description`) disambiguation |
| Home Feed — a deactivated sport pill prompts the reactivate nudge, "Later" lets it through | Same seed → the muted "Pickleball" pill (`text-text-muted`) → click → `ReactivateSportNudgeDialog` ("This sport profile is down. Do you want to bring it up?") → **Later** → nudge closes, Pickleball pill is now `aria-pressed` (selection went through) → switch to "All" and back to Pickleball → **no nudge** this time (deferred for the session via `inactiveSportNudgeStore`) | §2e. `Later` doesn't reactivate — it just lets the current selection through and silences the nudge for the session |
| Groups — opening a group linked to a deactivated sport prompts the reactivate nudge | Same seed → open "Weekend Tennis Ladder" (`mockOwnedGroup`, a Pickleball group) in the Group filter → `ReactivateSportNudgeDialog mode="group"` ("This is a Pickleball group, but your Pickleball profile is down…") → **Yes** → reactivates (`POST {isResume:true}`), the muted "Reactivate Pickleball" Sport-filter pill is gone | §2e. Fires from `selectGroupAndShowPosts` when the group's `sportId` is an inactive-only sport; once per group per session |

**Separate tests — CLIENT-MODAL-1 stale-mutation-error regressions:**

All three force the failure with `page.route()` rather than a genuine rejection — the same pattern
`auth-journey.spec.ts` uses for its logout 401. For add-sport the real "Already has a profile for
this sport" 400 is *unreachable through the UI*, because the Sport select only offers sports the
user does not already hold. Each was confirmed to fail with the fix reverted.

| Test | What it checks | Notes |
|---|---|---|
| a failed add-sport does not reappear when the dialog is reopened | Fail the add → alert shown → Escape → reopen → no alert | The ticket's confirmed instance. Needs `seedZeroSportProfilesOnNextLoad` so the picker actually opens — the primary fixture user holds every catalog sport, which since **SPORT-5** opens `NoSportsToAddDialog` instead |
| a failed create-group does not reappear when the modal is reopened | Same cycle on `CreateGroupModal` | `GroupsPage` resets this one inline in JSX with no hook to unit-test, and **no RTL test in this repo renders `GroupsPage`** — so this e2e case is its only regression coverage. No group selected here, so `lockedSport` is null and the Sport select *is* rendered (unlike the main journey's step 6) |
| a failed delete-group does not reappear when the dialog is reopened | Same cycle on `DeleteGroupConfirmDialog`, reached through the owner-only Danger zone | Same inline-JSX reason as create-group. Selects "Weekend Tennis Ladder" first — the Settings tab only exists once a group is selected, same entry `group-settings.spec.ts` uses |

### `e2e/flows/group-settings.spec.ts` (GRP-2, one `test()` with 4 steps)

Uses `mockOwnedGroup` ("Weekend Tennis Ladder") — the only fixture group where the test user is
`group_owner`, required for General's Privacy/rules/schedule (owner+admin) and Permission's three
toggles (owner-only) to all be editable.

| Step | What it checks | Notes |
|---|---|---|
| 1. sections default-expanded | `General`/`Permission` both `data-state="open"`; collapsing one (General) hides its content but leaves the other's visible | Verifies the two-collapsible-section split, added when this ticket was extended mid-session |
| 2. edit General (rules) + Permission (a toggle), one shared Save, persists both | Rules textarea + "Allow member invites" toggle both edited → one Save enables/persists both → reload + re-select group + re-open Settings → both still set | Confirms real server round trips via `PUT /api/groups/:groupId` (rules — no handler existed for this endpoint before this ticket, Privacy's own e2e coverage never exercised it either) and `PUT /api/groups/:groupId/settings` (toggle) |
| 3. tab-switch guard, Discard | Rules edited further (unsaved) → click Posts tab → Discard/Save dialog appears → Discard → lands on Posts tab; re-opening Settings shows step 2's saved value untouched | Covers the guard's in-page tab-switch trigger, now from a General-section edit rather than Permission |
| 4. in-app-nav guard, Save | Toggle off again (unsaved) → click Home in `NavTabs` → dialog appears, URL still `/groups` (blocked) → Save changes → proceeds to `/` | Covers the `useBlocker`-backed in-app-navigation trigger (requires the data router, ROUTER-1) |

**Not covered here** (see `useSettingsUnsavedGuard.test.tsx`/`GroupSettingsTab.test.tsx` for these instead):
the guard's third trigger (`beforeunload` on browser close/refresh/typed-URL nav) — that can only ever
show the browser's own native prompt, nothing a Playwright assertion can meaningfully exercise; admin/
member read-only rendering of the three toggles and rules/schedule (pure component-level concern, no
real navigation involved); independent single-section saves (rules-only, toggle-only) — covered at the
hook level in `useSettingsUnsavedGuard.test.tsx` instead of duplicating here.

### `e2e/flows/group-members.spec.ts` (GRP-3, GRP-4, 2 `test()`s)

Uses `mockOwnedGroup` ("Weekend Tennis Ladder", test user is `group_owner`) for the owner-only
section and the accept flow, and `mockGroup` ("Friday Night Football", test user is a plain
`group_member`) to confirm the role-gated section stays hidden for a non-manager. GRP-4's step 3
uses `mockFriend` ("Priya Shah", id `priya-shah`) as the invitable-friend fixture — distinct from
`mockGroupJoinRequest`'s unrelated "Priya Shah" row (a different id) already in "Waiting for group
approve"; `mockFriend` is neither a member nor already invited to `mockOwnedGroup`.

**Test 1 — owner sees all 5 sections, accept/decline, filtering, and Invite friend** (4 steps):

| Step | What it checks | Notes |
|---|---|---|
| 1. all 5 sections render with real fixture data | "Waiting for group approve" (Priya Shah), "Waiting for user accept" (Robin Park, "Invitation sent — waiting for owner approval"), "Group administrator" (Jordan Lee owner-first, then Sam Ito), "Members" (Alex Chen), "Blacklist" ("Coming soon.") | `mockGroupJoinRequest`/`mockSentInvitation`/`mockGroupMembers` fixtures, all scoped to `mockOwnedGroup.id` |
| 2. "find member" filters all visible lists in place | Typing "sam" narrows Group administrator to Sam Ito, empties Members to "No matches.", URL unchanged | No debounce, case-insensitive substring — matches the literal spec |
| 3. Invite friend opens pre-filled, auto-runs a real search, and invites a friend (GRP-4) | Click "Invite friend" with "priya" typed → dialog's search input pre-filled "priya" → real debounced `GET /users/search` returns Priya Shah (a friend, not yet a member/invited) → click Invite → row flips to "Already invited", button gone | Real `POST /groups/{groupId}/invitations`; supersedes GRP-3's mocked "Search coming soon." step |
| 4. Accept moves the request into Members | Click Accept in "Waiting for group approve" → Priya Shah disappears from that section, appears in Members | Exercises the stateful MSW accept handler (removes from the group's join-request queue, appends a `group_member` row) |

**Test 2 — a plain member never sees "Waiting for group approve":** selects `mockGroup` (test user is
`group_member` there), opens Members tab, confirms "Group administrator" renders but "Waiting for
group approve" does not — the parent hook never even fires that request for a non-manager (the real
endpoint 400s for one).

### `e2e/flows/group-invitations.spec.ts` (GRP-7, GRP-8, 5 `test()`s)

GRP-7's invitation approve/accept lifecycle, extended by GRP-8's sport-pill/merged-inviter/reject-reason/
join-request-withdraw/sport-add-on-accept polish. Uses `mockOwnedGroup` ("Weekend Tennis Ladder") for the
owner/admin approval-queue journey, and `mockPublicGroup` ("Riverside Hoopers", Pickleball) via
`mockReceivedInvitation` for the invitee-facing acceptance journey.

| Test | What it checks | Notes |
|---|---|---|
| Merged approval queue shows both row types, approving an invitation only clears the queue row | A join request and a `pending_owner` invitation render together in "Waiting for group approve"; approving the invitation removes only that row (no member added — real semantics: approve just moves `pending_owner` → `pending_user`); the join request still accepts normally afterward | GRP-7 |
| Invitations section accepts an invitation and navigates into the new group, sport pill included | Accept → lands on the new group's Posts tab; **GRP-8 part 1**: `SportSwitcher`'s Pickleball pill is now active (`aria-pressed="true"`) — no more forcing "All" first, since B15 added `sportId` to the invitation | SPORT-3: renamed from Basketball. Also asserts the merged-inviter copy: "Group invitation from Priya Shah" |
| A group selection on the Groups page survives switching sport on Home Feed, but not an explicit "All" click on the Groups page itself | Open a group (Pickleball pill active) → switch to Home, click "All" there → back to Groups, group still open, pill still Pickleball → click "All" directly on Groups → group deselected | SPORT-3: renamed from Tennis. Regression guard for the `homeFeedStore`/`groupsPageStore` split. Waits for Home Feed's own `<h1>` before touching its Sport filter — same shared-accessible-name race as `feed-groups-journey.spec.ts` step 9, reproduced under parallel headless runs |
| Invitations section is absent once there are none to show | Reject → **GRP-8 part 2**: opens `RejectInvitationConfirmDialog` first (optional reason, left empty here) → confirming inside the dialog removes the row | Exercises "reason is optional" (user decision) |
| Join requests section withdraws the current user's own pending request | `mockJoinRequest` seeded via a new admin route (`seed-join-requests` — no existing e2e coverage of `JoinGroupModal`'s search UI to drive instead) → "Riverside Hoopers" row visible with a "Withdraw" button → clicking it empties the section | **GRP-8 part 3** |
| Accepting an invitation for a sport the invitee lacks offers to add it first | Test user's sport profiles zeroed via `seedZeroSportProfilesOnNextLoad` → Accept → `AddSportIntroDialog` ("This Pickleball group…", OK button) → `AddSportModal` pre-selected to Pickleball → submitting adds the profile then accepts the invitation, landing on the new group's Posts tab | **GRP-8 part 5**. SPORT-3: renamed from Basketball |

### `e2e/flows/friends-journey.spec.ts` (FRIEND-1 + CLIENT-NOTIF-5 + FRIEND-2, one `test()` with 8 steps)

Uses `mockFriend` ("Priya Shah", Offline), `mockIncomingFriendRequest` ("Hana Kim" → the test user,
Friend Requests), `mockSentFriendRequest` ("Diego Alvarez", outgoing, also Friend Requests), and
`mockSearchResultUser` ("Owen Clarke", `friendshipStatus: 'NONE'`, Add-mode-only).

| Step | What it checks | Notes |
|---|---|---|
| 1. all 4 sections render | Online/Blocked "Nothing here yet." (no presence system/blacklist backend exists); Friend Requests shows Hana Kim; Offline shows Priya Shah | |
| 2. rail search filters in place | Typing "priya" narrows Offline to Priya Shah, empties Friend Requests to "No matches." | No debounce — this is the rail's local filter, not Add mode's directory search |
| 3. select an existing friend | Profile panel shows bio; chat panel visible; no "Send a friend request" button; the `FRIENDS`-status action bar shows the "Friend" menu button (FRIEND-2) | |
| 4. Add friend searches the real directory + sends a request | "Add friend" → type "Owen" → `Matches for "Owen"` → select → real `POST /users/friends/requests` → panel shows "Waiting for response" status **+ a "Cancel request" button** (CLIENT-NOTIF-5) | Exercises the debounced `GET /users/search` end-to-end, not MSW-bypassed |
| 5. cancel withdraws an outgoing request but keeps the person selected (CLIENT-NOTIF-5 + FRIEND-2) | Clear search → select "Diego Alvarez" (`mockSentFriendRequest`, outgoing) from Friend Requests → "Cancel request" → real `DELETE /users/friends/requests/{id}` → row disappears from Friend Requests, **panel stays open on Diego re-resolved to `NONE`** ("Send a friend request" button, not the placeholder) | Exercises the stateful MSW delete handler (drops the row from `sentRequestsState`); `useFriendsPageData` carries the real `requestId` for `PENDING_SENT` and, FRIEND-2, keeps the selection via `keepSelectedAfterCancelId` |
| 6. the default friend list is intact | Add-mode "back to friend list" gone; Offline still shows Priya Shah | |
| 7. accept moves the request **and keeps the new friend selected** | Select Hana Kim (Accept/Decline visible) → Accept → disappears from Friend Requests, appears in Offline; the panel re-resolves her to a friend (the `Friend` menu button is shown, not the empty-selection placeholder) | Exercises the stateful MSW accept handler (moves the row from `receivedRequestsState` into `friendsState`); regression guard for the FRIEND-2 fix that widened the auto-clear gate to `isFetching` so the refetch race can't drop the selection |
| 8. unfriend via the Friend menu (FRIEND-2) | Select Priya Shah → "Friend" button → `Unfriend` menuitem → `UnfriendConfirmDialog` ("Do you really want to unfriend Priya Shah?") → confirm → real `DELETE /users/friends/{id}` → row disappears from Offline, panel back to the "Select a friend…" placeholder | Exercises the new stateful MSW delete handler (drops the row from `friendsState`); `useFriendsPageData.unfriend` clears the selection on success, same as decline/cancel. The dialog is chrome-light — no header bar; its `DialogTitle` is `sr-only` |

**Removed (CHAT-9, 2026-07-28):** a 7th step asserted `FriendChatPanel`'s old local-state-only mock
chat didn't persist across a re-selection. CHAT-9 wired the panel to the real chat service
(`useDirectChatData`), so that premise is no longer true. Real, MSW-backed chat e2e coverage now lives
in its own spec — `direct-chat.spec.ts` below (CHAT-10) — not folded back into this file, per this
repo's one-spec-per-feature convention.

### `e2e/flows/group-chat.spec.ts` (CHAT-10, one `test()` with 7 steps)

Covers `GroupChatTab` (CHAT-8), wired to a new MSW backend for chat (`mocks/handlers/chat.ts` — a
separate, unwrapped-JSON backend, not the monolith's `ApiResponse<T>`) plus editing/deleting
(CHAT-13) and typing indicators (CHAT-15). Real-time push is proven via a fake, in-page `WebSocket`
(`mocks/fakeChatSocket.ts`) rather than a second real browser client — the app's chat socket is
receive-only (every mutation is REST, see `useChatConversation.ts`), so a fake that fires `onopen`
and lets the test drive `onmessage` is a complete substitute, not a partial one; the mock server
itself has no WebSocket support and doesn't need any. Uses `mockGroup` ("Friday Night Football").
Happy-path only (user decision, 2026-07-28) — failed-send/403-membership-gate states are `CHAT-11`'s
scope. Attachments (CHAT-16) aren't shipped yet, not covered.

| Step | What it checks | Notes |
|---|---|---|
| 1. empty state | "No messages yet." renders | |
| 2. send | Message appears, composer clears | Real `POST /conversations/:id/messages` against the mock |
| 3. reload persists | Reload + re-select group + Chat tab → message still there | Proves `GET /conversations/:id/messages` history, not local-only state |
| 4. edit | Own message's "Edit message" button → edit box → Save → new content + "(edited)" marker | `PATCH /conversations/:id/messages/:messageId` |
| 5. delete | "Delete message" → "Message deleted" placeholder, original text gone | `DELETE /conversations/:id/messages/:messageId`, content scrubbed |
| 6. real-time push | `pushChatEvent` simulates a `MESSAGE_CREATED` frame from "Priya Shah" → appears with no reload | Exercises the fake WebSocket, not a REST round trip |
| 7. typing indicator | `pushChatEvent` simulates `USER_TYPING` start → "Priya Shah is typing…" appears; stop → clears | |

### `e2e/flows/direct-chat.spec.ts` (CHAT-10, one `test()` with 7 steps)

Same shape and scope as `group-chat.spec.ts` above, for `FriendChatPanel` (CHAT-9) instead — see that
entry for the shared design notes (fake WebSocket, happy-path-only scope, mock chat backend). Uses
`mockFriend` ("Priya Shah", id `priya-shah`), selected via the Offline section rather than a group
switcher + tab click.

| Step | What it checks | Notes |
|---|---|---|
| 1. empty state | "No messages yet." renders | |
| 2. send | Message appears, composer clears | |
| 3. reload persists | Reload + re-select Priya Shah → message still there | |
| 4. edit | "Edit message" → edit box → Save → new content + "(edited)" marker | |
| 5. delete | "Delete message" → "Message deleted" placeholder | |
| 6. real-time push | Simulated `MESSAGE_CREATED` from Priya Shah appears with no reload | |
| 7. typing indicator | Simulated `USER_TYPING` start/stop shows and clears "Priya Shah is typing…" | |

**Conversation id note (both specs above):** the mock chat session (`handlers/chat.ts`) assigns
conversation ids starting at `90001`; each test gets a fresh session with exactly one conversation
opened, so `90001` is deterministic in step 6/7's `pushChatEvent` calls, not a hardcoded guess.

### `e2e/flows/msw-setup.spec.ts` (proves the mock server itself works)

| Test | What it checks | Notes |
|---|---|---|
| `MSW intercepts POST /api/auth/login and returns the fixture` | Raw `fetch` from page context → asserts response body **and** cross-checks `GET /__mock/sessions/:id/requests` shows the call | The request-log check is MSW-1's replacement for the old `response.fromServiceWorker()` assertion |
| `MSW returns 401 for wrong credentials` | | |
| `MSW rejects /api/auth/refresh without a valid refresh cookie` | | |
| `MSW rejects /api/auth/logout without an Authorization header` | | |

This file exists specifically to prove the mocking layer works in isolation, before any real UI
consumer exercises it — no login form is used, just raw `fetch()` calls.

### `e2e/flows/post-deep-link.spec.ts` (FEED-12, 2 independent `test()`s)

`/posts/:postId` is a real, URL-addressable route (Option A: renders `HomeFeedPage` underneath, dialog
pre-opened) — this file is the dedicated coverage for that, separate from the in-feed click-to-open
path other specs already exercise incidentally.

| Test | What it checks | Notes |
|---|---|---|
| `loading a shared post link directly renders the post + comments, even outside the feed's first page` | `seedPaginatedFeedOnNextLoad(mockSessionId)` (21-post fixture) → direct `seedAuthenticatedSession(page, '/posts/1020')` (post **1020**, index 20 — only reachable via "Load more" on page 0) → dialog renders the right post/comments on a cold load; closing returns to `/` with the normal Home Feed visible | Drives the real "shared link, not logged in yet" flow end-to-end (redirect to `/login`, bounce back) — the same generic mechanism AUTH-8's step 7 already covers, not something FEED-12 built itself. Proves the dialog doesn't depend on the feed having paginated the post into view first. |
| `opening comments from the feed updates the URL, and closing returns to it` | Click a post's "View comments" from `/` → URL becomes `/posts/{id}` → Close → URL back to `/` | Confirms the in-feed path is also URL-addressable now (`navigate` push on open, `replace` on close), not just the direct-load path above |

### `e2e/flows/matches-journey.spec.ts` (CLIENT-SESSION-1/…/CLIENT-SESSION-9, SPORT-10, one `test()` with 10 steps + steps 3b/3c/5b + 1 separate `test()`)

`/matches` (real page, replacing `ComingSoonPage`) — list/create/join/leave/cancel, plus
CLIENT-SESSION-4's invite/auto-approve fields and approval queue, plus CLIENT-SESSION-5's
favorite-locations round trip, plus CLIENT-SESSION-6's Discover grid / "My sessions" panel split,
plus CLIENT-SESSION-8's inline "Discussion" section, plus CLIENT-SESSION-9's card-level
Join/Accept/Cancel/Leave action button. CLIENT-SESSION-9 also split each session card's single
"View details" button into two sibling buttons ("View details" + the participation action, when
one applies), so every step that opens a card by clicking on its title now disambiguates via
`{ name: /<title> — View details/ }` instead of a bare title regex — both buttons' aria-labels
contain the title.
Fixtures: `mockSession` (standalone, created by the test user, `participantCount: 0`),
`mockGroupSession` (linked to `mockGroup`, created by someone else — the test user is only a
`group_member`), `mockOwnedGroupSession` ("Ladder night", the test
user is `group_owner` — `canManage` true), `mockDiscoverableSession` ("Weekend 5-a-side",
standalone, created by someone else, Badminton (SPORT-3: was Soccer) — a sport the test user holds an active profile for —
the only fixture eligible for `GET /sessions/discover`; every other session fixture is either
self-created or `GROUP_RECURRING`), `mockFriend` (the invite-friend field's search target), and
`mockSessionJoinRequest`/`mockSecondSessionJoinRequest` (two pre-seeded `REQUESTED` rows on
`mockOwnedGroupSession` — same "pre-seed the other person's row" precedent as
`group-invitations.spec.ts`'s `mockGroupJoinRequest`, since this mock server has no second live
authenticated identity to actually request-join as). All session fixtures carry
`autoApprove: true` (real SESSION-6 backfilled every pre-existing session this way; only a
genuinely new session created mid-test defaults to `false`). The create step searches the
pre-seeded `mockLocation` rather than exercising `LocationPicker`'s paste-a-link/resolve flow —
that's covered by `LocationPicker`'s own component/Storybook tests, not e2e. Favorites start empty
each run (`mocks/handlers/locations.ts`'s `favoriteLocationIds`) — step 8 exercises the full
favorite/unfavorite round trip itself rather than relying on a pre-seeded favorite, since a
single-user mock can simulate that action directly (unlike step 7's REQUESTED rows). Steps 1-8
all target sessions that render inside the "My sessions" panel (`region` "My sessions") — the
Discover/"My sessions" split (CLIENT-SESSION-6) doesn't change where those assertions look, since
`page.getByText`/`getByRole('button', ...)` finds them regardless of which region they're in;
steps 9-10 are what's actually new.

| Step | What it checks | Notes |
|---|---|---|
| 1. load | `mockSession`/`mockGroupSession` render (My sessions), `mockDiscoverableSession` renders in the Discover region | |
| 2. sport filter | Filtering to Pickleball narrows to `mockSession`; "All" restores both | SPORT-3: renamed from Basketball. Filters both panels — `mockDiscoverableSession` (Badminton) isn't asserted here, covered by step 9 instead |
| 3. join | Open `mockSession`'s detail → Join → participant count 0→1 → neither Join nor Leave shows afterward | `mockSession` is created by the test user; CLIENT-SESSION-10 hides the plain Leave action for the creator — the Leave mutation itself stays covered by step 5b on `mockGroupSession`, which the test user didn't create. **Step 4 removed** (was: cancel the session via "Cancel session" → reason → Confirm cancel) — CLIENT-SESSION-10 post-ship removed the Cancel session button from `SessionDetailModal` entirely, user decision; there's no longer any UI path to cancel a session, so nothing replaces this step. Numbering keeps the gap (3 → 5) rather than renumbering every later step for a cosmetic concern |
| 3b. Discussion | Reopen `mockSession`'s detail → `region` "Discussion" shows the pre-seeded comment → post a new one → it appears | CLIENT-SESSION-13 added a second pre-seeded row to this thread (a `SESSION_SYSTEM` entry); this step asserts on the user comment's text specifically, so it was unaffected. CLIENT-SESSION-8. Reuses `mockSession`, still `SCHEDULED` (the session that used to be cancelled in the now-removed step 4) — the thread stays open regardless of `SessionStatus`, but this step targets the still-`SCHEDULED` case. `isCommentsForbidden` is never exercised here — this mock doesn't simulate the real backend's 403 for a non-participant (see the handler file's own note). CLIENT-SESSION-10 moved the composer (`SessionCommentComposer`) out of the "Discussion" region into the dialog's pinned footer — the composer's own textbox/Post-button queries are scoped to `dialog`, not `discussion`, from this step onward |
| 3c. heart button | Reopen `mockSession`'s detail → "Like" button shows count 0 → click → "Unlike" shows count 1 → click → back to "Like"/0 | CLIENT-SESSION-8. `mockSession` starts `isLikedByCurrentUser: false`/`likeCount: 0`; the round trip proves both `POST` and `DELETE /api/sessions/{id}/like` |
| 5. group session, member-only | Open `mockGroupSession`'s detail → Join still available | The test user is a `group_member`, not owner/admin, and didn't create it |
| 5b. card-level Join/Leave | Click `mockGroupSession`'s own "Join" button on its card (not the modal) → card's button flips to "Leave" → click it → flips back to "Join" | CLIENT-SESSION-9. No dialog opens for either click — proves the card's own action button round-trips through `sessionKeys.all` invalidation the same way the modal's Join/Leave already did |
| 6. create | "Create session" → pick Pickleball → "Choose location" (opens the favorites dropdown) → "Choose a location…" → search "Riverside" → select `mockLocation` → fill start time/title → invite `mockFriend` (badge appears) → check "Auto approve join request" (warning appears) → submit → dialog closes, new session appears in the list | SPORT-3: renamed from Basketball. Two dialogs/a dropdown all open in sequence (`CreateSessionModal`, its `LocationFavoritesDropdown`, and the nested `LocationPicker`) — the dropdown's own menu items are queried via `page.getByRole('menuitem', ...)`, not scoped to `createDialog`, since `DropdownMenuContent` portals as a DOM sibling of the Dialog, not a descendant |
| 7. approval queue | Open `mockOwnedGroupSession`'s ("Ladder night") detail → "Waiting for approval (2)" shows both requesters → Approve one (moves into Players) → Reject the other with a reason → section disappears | Only renders for `canManage`; reject reveals an inline optional-reason box, not a second dialog. CLIENT-SESSION-10 renamed the "Participants" section to "Players" |
| 8. favorite a location, then pick it from the favorites dropdown | Open a new create form → dropdown shows "No favorites yet." → open `LocationPicker`, search "Riverside" → click the heart on `mockLocation`'s row (aria-label flips to "Unfavorite …") → select it → reopen the dropdown → the just-favorited location now lists instead of the empty state → selecting it sets the location again | Confirms `LocationFavoritesDropdown`'s real Radix `DropdownMenu` (`modal={false}`) actually works nested inside the Dialog — CLIENT-SESSION-2 had reverted an earlier attempt after it appeared broken live; CLIENT-SESSION-5 found and fixed the real cause (see its summary doc) |
| 9. discover → join → moves to My sessions | `mockDiscoverableSession` visible in Discover, not in My sessions → open its detail → Join → Leave button appears → close → now absent from Discover, present in My sessions | Both `useDiscoverSessions`/`useJoinedSessions` invalidate off the same `sessionKeys.all` root, so no manual reload/refetch is needed; the mock's `GET /sessions/discover` handler excludes any session the caller currently has a `JOINED` row for, same exclusion rule as the real backend |
| 10. search filters Discover; the panel toggle hides/shows My sessions | Typing a non-matching string into the search box shows "No sessions match your search." in Discover; the "Hide my sessions"/"Show my sessions" button toggles the whole `region` "My sessions" | Search is client-side only (`useMatchesPageData`'s `discoverSessions` memo), not a new backend query |

**Separate test — SPORT-10 §2e reactivate nudge ("Yes" path):**

| Test | What it checks | Notes |
|---|---|---|
| Matches — a deactivated sport pill nudge, "Yes" reactivates it | `seedSoftDeletedSportProfileOnNextLoad(mockSessionId)` → the muted "Pickleball" Sport-filter pill → click → `ReactivateSportNudgeDialog` ("This sport profile is down…") → **Yes** → `POST /api/sports/profiles {isResume:true}`, dialog closes, the muted "Reactivate Pickleball" pill is gone and Pickleball is a normal pill | §2e. The `feed-groups-journey` nudge test covers **Later**; this covers **Yes** on a second non-profile page |

### `e2e/flows/notification-bell.spec.ts` (CLIENT-NOTIF-1 + CLIENT-NOTIF-5 + FRIEND-2, five `test()`s — a 4-step journey + four regression/navigation cases)

The `TopBar` bell + dropdown — unread badge, list-on-open, mark-read-on-click + shell-level
in-place modal, and "Mark all read". Fixtures: `mocks/handlers/notifications.ts`'s
`defaultNotificationsState` — 2 unread (id 1 aggregated to 2 distinct actors, `mockFriend`/Priya
Shah + a second inline actor "Hana Kim", exercising `getNotificationText`'s "and 1 other" branch;
id 2 a single-actor `session.join_request.created`) and 5 already-read (id 3,
`session.join_request.approved`, no actor — exercises the "Someone"-less approval-outcome copy;
ids 4 and 5, added by CLIENT-NOTIF-3, a `session.participant.left` and an actor-less
`session.status.started`; ids 6 and 7, added by CLIENT-NOTIF-5, a `user.friend_request.created`
(actor **Hana Kim**, who has a real pending *incoming* request in `handlers/friends.ts`) and a
`user.friend_request.accepted` (actor **Priya Shah**, an established friend) — the only two with
`entityType: 'USER'`, so the fixture covers every type the backend actually emits, a type missing
from it is how CLIENT-NOTIF-3's bug stayed invisible). **Ids 4-7 are seeded read on purpose:** the
unread count stays 2, so this spec's badge and mark-all-read assertions were not rewritten to
accommodate new fixture rows. Ids 1-5 reference `mockSession`'s id (1) as `entityId`; ids 6-7 use
the actor's own user id (matching U13's `UserEventProcessor`), which is what the Friends page
pre-selects. A third `user.friend_request.created` — pointing at an id in no list — is seeded
per-test via `seedUnavailableFriendRequestNotification` (mockServer action
`seed-unavailable-friend-request-notification`), not in the default fixture.
No coverage of the STOMP live-push path
here (NTF-3's own `NotificationStompIntegrationTest`/`useNotificationLiveSocket.test.tsx` already
cover it end to end) — this spec is scoped to the REST-backed list/read/badge behavior
CLIENT-NOTIF-1 actually built.

**Design note (2026-08-18, at pickup of a follow-up correction):** clicking a notification does
**not** navigate to `/matches?session={id}`. A first draft did that; the user flagged it live
(reported both the unwanted page switch and a concrete symptom of a real bug: navigating to
`/matches` with a different `?session=` while already on `/matches` silently did nothing, since
`MatchesPage`'s `initialSessionId` is only ever read from the URL once, at mount). Fixed by giving
`AppShell` its own shell-level `SessionDetailModal` instance (fed by the same
`useSessionDetailModalData` every page's own in-place "View details" modal already uses) — the bell
now opens that overlay directly, with **no URL change at all**, regardless of which page the caller
was on. Test 2 below is the regression case for the exact bug that motivated this.

| Step (`Notification bell journey`) | What it checks | Notes |
|---|---|---|
| 1. initial badge | Bell shows "2 unread notifications" before the dropdown is ever opened | Proves `useUnreadNotificationCount` alone drives the badge — no `GET /notifications` list call happens yet |
| 2. open — list fetched, aggregated text renders | Clicking the bell renders all 3 rows' derived text, including the 2-actor "and 1 other" phrasing and the no-actor approval-outcome sentence | First point the list query (`enabled: isOpen`) actually fires |
| 3. click a row | Clicking the aggregated unread row marks it read, opens `SessionDetailModal` in place (still on `/`, URL unchanged before and after), badge drops to "1 unread notifications" | Home Feed is the seeded starting page — proves the modal overlays it directly, no page switch |
| 4. Mark all read | Closing the modal, reopening the bell, clicking "Mark all read" clears the one remaining unread row and hides both the button and the badge | Fires one `PUT /{id}/read` per currently-loaded unread id (no bulk endpoint exists) — only id 2 needed marking, id 3 was already read |

`Notification bell journey — clicking a notification while already on /matches` — seeds straight
onto `/matches` (which already renders `mockSession` as a "Sunday pickup run" card in its own "My
sessions" panel), opens the bell, clicks the aggregated row, and asserts the shell-level dialog
opens and the URL stays exactly `/matches` (no `?session=` appended, no reload). This is the
scenario that would have silently failed under the old navigate-to-`/matches?session={id}`
approach.

`Notification bell journey — a friend-request notification routes to /friends and pre-selects the
requester` (CLIENT-NOTIF-5) — opens the bell, clicks the "Hana Kim wants to be your friend" row
(fixture id 6, `entityType: 'USER'`), asserts the URL becomes `/friends`, the popover closes, and
the profile panel's **Accept/Decline** action bar is showing (i.e. Hana's pending incoming request
was pre-selected via router `location.state.focusPersonId`). Friend-request notifications are the
**one** type that navigates rather than opening a shell-level modal — the Friends rail's
incoming-requests section has no modal equivalent, and it's expanded by default on that page.
**FRIEND-2 guard:** then Accepts Hana (the `Friend` menu button appears), opens the menu → Unfriend
→ confirm, and asserts the **"Friend request unavailable"** dialog does *not* appear — once the
focus person has resolved once, a later user-caused disappearance can't re-raise it.

`Notification bell journey — a friend-request notification for a vanished requester shows the
unavailable dialog` (CLIENT-NOTIF-5) — seeds `seedUnavailableFriendRequestNotification`, clicks the
"Sam Rivera wants to be your friend" row whose `entityId` matches nobody in the friend/request
lists (request cancelled, or account deactivated), asserts the URL still becomes `/friends` but a
**"Friend request unavailable"** dialog opens instead of a pre-selection; "Got it" closes it and
the "Select a friend…" placeholder stays. `focusUnavailable` is derived in `useFriendsPageData`
from the `focusPersonId` prop + the live lists (no stored flag); the dialog's close navigates to
strip `location.state`, which is what flips it back off. This is a **`created`** notification —
the dialog is gated to that type.

`Notification bell journey — a stale "is now your friend" notification lands on /friends with no
dialog` (FRIEND-2) — seeds `seedStaleAcceptedFriendNotification` (a `user.friend_request.accepted`
row whose `entityId` matches nobody — the person accepted then unfriended since), clicks
"Sam Rivera is now your friend", asserts the URL becomes `/friends` and the "Select a friend…"
placeholder shows with **no** "Friend request unavailable" dialog. `focusReason: 'accepted'`
(carried on `location.state` from the notification type) suppresses `focusUnavailable`.

### `e2e/flows/admin-route-guard.spec.ts` (ADMIN-1, ADMIN-4, 4 `test()`s)

The `/admin` route's **role** guard — the suite's first and only authorization coverage. Every other
spec logs in as `mockUser` (`roles: ['USER']`) and no route used `requiredRole` before ADMIN-1, so
`ProtectedRoute`'s role branch had never executed in a browser. Note the distinction this spec turns
on: existing *authentication* coverage (`auth-journey.spec.ts` step 7) proves a logged-out visitor is
redirected; nothing proved a logged-**in** user lacking a role is.

| Test | Asserts |
|---|---|
| a user without ADMIN is redirected away from /admin | Logs in as `mockUser`, navigates to `/admin`, lands on `/` with no "Admin" heading. The redirect is deliberately silent — `/admin` is unlinked, so not confirming it exists beats a 403 page (confirmed at pickup; a dedicated unauthorized page would be a `ProtectedRoute`-level change serving every future role-gated route). |
| a user holding ADMIN reaches /admin | Logs in as `mockAdminUser`, navigates to `/admin`, sees the shell heading, the section index ("Sections") with its "Sports" link, and **no** member-facing chrome — `/admin` sits outside `AppShell` on purpose. *(ADMIN-2 replaced the original "No admin sections are available yet." empty state this asserted, with the first real section link.)* |
| an admin logs out from the admin shell (ADMIN-4) | Clicks "Log out" in the `AdminLayout` header, lands on `/login`, then re-navigates to `/admin` and is bounced back — proving the session is genuinely cleared, not merely navigated away from. This is the exit that exists *because* the test above asserts TopBar (the app's only other logout control) is absent from `/admin`. |
| the control is present on a nested admin route (ADMIN-4) | Deep-links to `/admin/sports/1` and asserts the header's "Log out" is visible there too — the control lives in the layout, so it must survive on child routes, not just the index. |

Fixtures: `mockAdminUser` (see §5) plus a second refresh-token string,
`mockAdminRefreshToken`. **Why the extra token matters:** `/api/auth/refresh` previously returned a
single fixed `authResult` (always `mockUser`). Since `page.goto('/admin')` is a full app mount, the
bootstrap refresh runs on arrival — with one shared token the admin would have been re-identified as
a plain `USER` and redirected, failing the test for a reason unrelated to the guard. The handler now
resolves the account from the cookie, mirroring how a real session identifies itself.

What this catches that `src/features/admin/AdminLayout.test.tsx` cannot: a router-level mistake —
`/admin` nested in the wrong place, or reachable around the guard through route ordering. The RTL
test renders the same `routes` export, but only a real navigation exercises a full mount including
the bootstrap refresh.

### `e2e/flows/admin-sports.spec.ts` (ADMIN-2, ADMIN-4, 6 `test()`s)

The sport master-detail admin screen at `/admin/sports` — the first admin section with real
behavior behind it. Both saves go through the real route tree, which is what distinguishes this from
`src/features/admin/AdminSportsPage.test.tsx`: only a real navigation proves `/admin/sports` and
`/admin/sports/:sportId` both resolve to the one page component, and that the section is reachable
from the `/admin` index.

| Test | Asserts |
|---|---|
| an admin edits a sport field and saves it | Logs in as `mockAdminUser`, enters the section from `/admin`, opens Badminton via "Show detail", edits Category, saves. Asserts the "Saved" status **and** that the new value appears in the master table — proving the mutation's `adminKeys.sportsAll()` invalidation actually refetches, rather than the panel alone updating. |
| an admin edits and saves the attribute schema | Deep-links to `/admin/sports/1`, confirms the fetched document is in the textarea, replaces it, saves. Covers the second of the two independent Save buttons. |
| invalid JSON is rejected locally before any request | Types unparseable JSON, clicks Save, asserts the local parse error **and** — via a `page.on('request')` listener — that **no** `PUT` was issued at all. The "fires no request" half is the point: a server round trip for text that cannot parse is the failure this guards. |
| a deactivated sport is editable like any other (A11) | Deep-links to `/admin/sports/4` (inactive Tennis) and completes a full schema edit → save. This case **inverted mid-ticket**: A9's `GET`/`PUT` asymmetry (verified live — the member read really did 404 for an inactive sport while the matching `PUT` returned 200) was fixed by backend `A11` in the same branch, so the screen no longer has an inactive-sport special case to assert. |
| unsaved sport-field edits are confirmed before discarding (ADMIN-4) | Dirties Category, clicks "Log out", asserts the confirm dialog appears and the admin is still on `/admin/sports/1` and still signed in. Cancels, asserts the edit survives verbatim, then re-opens and confirms via "Discard & log out" to reach `/login`. Lives in this file rather than `admin-route-guard.spec.ts` because it needs a genuinely dirty form, which only this section has. |
| a clean form logs out with no confirmation (ADMIN-4) | Opens the same panel, touches nothing, clicks "Log out" and goes straight to `/login`. Guards the inverse failure — a guard that always prompts is as broken as one that never does. |

Fixtures: reuses `mockAdminUser`/`mockAdminRefreshToken` from `admin-route-guard.spec.ts` (see §5).
The sport handler (`e2e/mocks/handlers/sport.ts`) gained four ADMIN-2/A11 endpoints —
`GET /api/sports/all`, `GET /api/sports/all/:sportId/attribute-schema` (A11's admin read),
`PUT /api/sports/:sportId/attribute-schema`, and `PUT /api/sports/:sportId` — all session-keyed and
stateful, so a save shows up on the next read. Its catalogue deliberately carries an **inactive**
sport (Tennis, id 4) that the public `GET /api/sports` fixture does not.

Two deliberate fidelity choices in that handler, both there to make a regression fail loudly rather
than pass quietly. The **member-facing** `GET /api/sports/:sportId/attribute-schema` is still
registered and still 404s for an inactive sport, so anything that points the admin editor back at
the active-only path breaks a test. And `PUT /api/sports/:sportId` mirrors the real duplicate-name
response — which A11 changed from a **500** to a readable **400**, so the handler was updated with
it rather than being left describing the old behaviour.

Related docs: `client/docs/MVP/ADMIN-2_SPORT_ADMIN_MASTER_DETAIL_PAGE.md`.

### `e2e/flows/profile-journey.spec.ts` (PROFILE-8, one `test()` with 7 steps + 1 separate `test()` — SPORT-10)

The `/profile` page's full journey — header/bio, `SportSwitcher`, posting from the composer, the
comment modal, Settings tab save, Edit Profile save, and the Memories placeholder.

| Step | Asserts |
|---|---|
| 1. load | Header shows "Jordan Lee" / "@jordanlee · Riverside" / the seeded bio, Posts tab selected by default, both of mockUser's own posts (`mockPost`/`mockGroupPost`, both Badminton) render |
| 2. SportSwitcher | Pickleball pill → "No posts yet for this sport." (mockUser holds a Pickleball profile but no Pickleball posts) → Badminton pill restores both |
| 3. composer | Typed content + "Post" (exact — `getByRole('button', { name: 'Post' })` without `exact: true` also matches "Post options"/the trending "#fridayrun 12 posts" button) → new article first, 3 total |
| 4. comment modal | Opens empty on the new post, adds a comment via `dialog.getByLabel('Add a comment')`, comment count bumps to 1 |
| 5. Settings tab | Skill level starts `intermediate`, Save disabled; changes skill level to `advanced` **and** the `SportAttributesFields` "Racket brand" attribute (Badminton's only schema field), Save enables, saves, Save disables again and both values persist |
| 6. Edit Profile modal | Prefilled ("Jordan" in First name), changes Bio, saves — modal closes and the new bio appears in `ProfileHeader` |
| 7. Memories tab | `ComingSoonPage` placeholder ("Memories" heading + "Coming soon.") |

**Two real MSW mutation gaps found and fixed at pickup** — neither existed before this ticket
(`PROFILE-7`'s visual-regression baselines never exercised a save, only a clean load):
`PUT /api/sports/profiles/:profileId` (`sport.ts` — merges `attributes` into the existing map rather
than replacing it wholesale, mirroring the real service's "omitted key keeps its stored value"
behavior) and `PUT /api/users/:userId/profile` (`friends.ts` — the `GET /api/users/:userId` own-id
branch `PROFILE-7` added was reading a fixed `mockMyProfile` constant; now backed by a new
session-scoped `myProfileState` field so a save actually changes what the next `GET` returns, same
"small stateful fake backend" pattern every other mutable fixture in this suite already uses).

**Separate test — SPORT-10 Active/Inactive toggle:**

| Test | What it checks | Notes |
|---|---|---|
| Settings tab — deactivate a sport, then reactivate it via the muted pill | `seedSoftDeletedSportProfileOnNextLoad(mockSessionId)` makes Pickleball soft-deleted → its **muted** `SportSwitcher` pill opens the Settings tab (`role="switch"` reads "Pickleball profile: Inactive", Skill level + Save disabled) → the switch → "Welcome back to Pickleball!" confirm → Reactivate → switch reads Active, fields editable, Pickleball is an un-muted active pill → switch back → "hidden from your active sports" confirm → Deactivate → Inactive again | The muted pill routes into the Settings tab (not `AddSportModal` — that reactivate variant is for the non-Profile surfaces). `DELETE /api/sports/profiles/:profileId` (soft delete) + `POST { isResume: true }` both go through `SportProfileStatusConfirmDialog`. `SportProfileStatusConfirmDialog` duplicates its prompt in an `sr-only` `DialogTitle` + a visible `<p>`, so `getByText(...).first()` |

Related docs: `client/docs/MVP/PROFILE-8_E2E_PROFILE_JOURNEY.md`,
`client/docs/MVP/SPORT-10_ADD_SPORT_RESUME_REACTIVATION_FLOW.md`.

### `e2e/visual/app-home-feed.spec.ts` (HF-10b, `visual-regression` project)

Parameterized: 3 breakpoints × 3 states = **9 test instances**, `home feed — ${state.name} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `default` | `seedAuthenticatedSession(page, '/')` | First article visible |
| `pickleball` | same + click Pickleball pill | Exactly 1 article. SPORT-3: renamed from `basketball` (baseline regenerated, not just relabeled — filename changed too) |
| `empty` | `seedEmptyFeedOnNextLoad(mockSessionId)` before seeding auth | "No posts yet for this sport." |

Every instance: freezes the clock (`page.clock.setFixedTime`, **before** any navigation, so relative
timestamps render deterministically) → waits for `document.fonts.ready` → full-page screenshot compared
against `e2e/visual/__screenshots__/home-feed-{state}-{width}.png`.

**Known, expected local noise:** baselines are **Linux-rendered** (via the `client-ci` workflow's
`update-baselines` dispatch). Running `pnpm test:visual` **locally on Windows will always show diffs**
(sub-pixel font-rendering/anti-aliasing, typically 0.01–0.04 pixel ratio) — this is not a regression,
it's been the documented behavior since HF-12. CI is the authoritative visual environment. Confirm a
real regression by inspecting the diff image directly (structural content/layout shift, not a uniform
text-shift pattern) before assuming something broke.

### `e2e/visual/app-groups.spec.ts` (GRP-10, `visual-regression` project)

Parameterized: 3 breakpoints × 6 states = **18 test instances**, `groups — ${state} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `discovery` | `seedAuthenticatedSession(page, '/groups')`, no group selected (default landing) | "Group name or invite code" input visible |
| `owner-posts` | Select `mockOwnedGroup` ("Weekend Tennis Ladder", sportId 3/Pickleball — the display name is an unrelated legacy string, see `fixtures.ts`), Posts tab, click the Broadcast toggle on | Posts tab selected, Broadcast toggle `aria-pressed="true"`. No fixture ties a post to this group, so the feed area legitimately shows its empty state |
| `member-posts` | Select `mockGroup` ("Friday Night Football", sportId 1/Badminton), Posts tab | Posts tab selected, no Broadcast toggle (plain member), first article visible (`mockGroupPost`) |
| `members-tab` | `mockOwnedGroup`, Members tab | "Group administrator" and "Waiting for group approve" regions visible |
| `settings-tab` | `mockOwnedGroup`, Settings tab | "Privacy" row visible |
| `chat-tab` | `mockGroup`, Chat tab, one message sent live through the real composer (MSW-persisted — `GroupChatTab` is wired to the real chat service, CHAT-8, not a local-state mock as GRP-1 originally shipped it) | Sent message text visible |

Every instance: freezes the clock (same instant as `app-home-feed.spec.ts`, for consistency — this
page renders no clock-sensitive content in any of these 6 states) → waits out every `Skeleton`
(`.animate-pulse`) and "Loading…" placeholder still on screen (`waitForContentSettled` — several of
this page's independent queries settle at different times, and screenshotting before all of them
resolve caused real `toHaveScreenshot` stability-check flakiness during development, not just local
Windows noise) → waits for `document.fonts.ready` → full-page screenshot compared against
`e2e/visual/__screenshots__/groups-{state}-{width}.png`. Same known-Windows-noise caveat as
`app-home-feed.spec.ts` above.

### `e2e/visual/app-session-detail-modal.spec.ts` (CLIENT-SESSION-12, `visual-regression` project)

Dialog-scoped (`page.getByRole('dialog')`, not full-page — same reasoning as `app-post-modal.spec.ts`,
the dimmed backdrop is already covered by Matches/Home Feed/Groups' own full-page specs).
Parameterized: 3 breakpoints × 7 states = **21 test instances**, `session detail modal — ${state} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `not-joined` | `mockDiscoverableSession` ("Weekend 5-a-side"), View details | "Join" button visible |
| `already-joined` | `mockGroupSession` ("Friday 5-a-side"), joined live via the card's own Join button, View details | "Leave" button visible |
| `invited` | `mockInvitedSession` ("Tuesday drop-in", **new fixture** — mockUser's own pre-seeded `INVITED` row), View details | "Accept" and "Decline" buttons visible |
| `requested` | `mockRequestedSession` ("Wednesday scrimmage", **new fixture** — mockUser's own pre-seeded `REQUESTED` row), View details | "Cancel" button visible |
| `approval-queue` | `mockOwnedGroupSession` ("Ladder night" — 2 pre-seeded `REQUESTED` rows from other users, mockUser is group owner), View details | "Waiting for approval" region + "Alex Chen" visible |
| `discussion` | `mockSession` ("Sunday pickup run" — pre-seeded with one user comment and, since CLIENT-SESSION-13, one `SESSION_SYSTEM` entry), View details | "Discussion" region + the seeded comment text visible + the system entry ("Priya Shah joined the session") explicitly asserted, so a fixture regression can't silently produce a baseline missing the row the case exists to cover |
| `cancelled` | `mockCancelledSession` ("Monday night run", **new fixture**, pre-set `status: 'CANCELLED'`), View details | Cancel reason text visible, no "Join" button (`canJoinOrLeave` gate) |

**3 new MSW fixtures** (`mockInvitedSession`/`mockUserInvitedRow`, `mockRequestedSession`/
`mockUserRequestedRow`, `mockCancelledSession`) added purely as seed data, same "pre-seed the
other side, no second live identity to act as" precedent as `mockSessionJoinRequest` — this mock
has no way for mockUser to organically become `INVITED`/`REQUESTED` (every session mockUser could
join has `autoApprove: true`, and mockUser is never anyone else's invitee), and
`SessionDetailModal`'s Cancel session button was removed entirely (CLIENT-SESSION-10), so there is
no live UI path left to reach `CANCELLED` from a fresh `SCHEDULED` session either.

Every instance: freezes the clock (same instant as every other visual spec) → blurs the active
element before screenshotting (`(document.activeElement as HTMLElement | null)?.blur()` — found
necessary live: a focused text input's blinking caret caused a real ~0.01-ratio pixel diff between
otherwise-identical consecutive local runs, on top of the already-known Windows font-rendering
noise) → waits for `document.fonts.ready` → dialog screenshot compared against
`e2e/visual/__screenshots__/session-detail-{state}-{width}.png`. Same known-Windows-noise caveat as
`app-home-feed.spec.ts` above.

### `e2e/visual/app-create-session-modal.spec.ts` (CLIENT-SESSION-12, `visual-regression` project)

Dialog-scoped, same shape as `app-session-detail-modal.spec.ts` above. Parameterized: 3 breakpoints
× 3 states = **9 test instances**, `create session modal — ${state} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `default` | Open "Create session" | Sport field visible, empty form |
| `location-chosen` | Open, select Pickleball, LocationPicker search "Riverside" → pick `mockLocation`, fill title/duration/open-slot | Chosen location name visible |
| `no-sport-profiles` | `seedZeroSportProfilesOnNextLoad(mockSessionId)` before `seedAuthenticatedSession`, close MatchesPage's own auto-prompted "Add a sport" dialog first (not the state under test), then open Create session | "add a sport first" gate text visible (`CreateSessionModal`'s own internal empty-profile prompt, distinct from the page-level auto-prompt) |

Same clock-freeze / blur-before-screenshot / `document.fonts.ready` sequence and known-Windows-noise
caveat as `app-session-detail-modal.spec.ts` above.

### `e2e/visual/app-notification-bell.spec.ts` (CLIENT-NOTIF-2, `visual-regression` project)

Dialog-scoped (`page.getByRole('dialog')`), same shape as `app-post-modal.spec.ts`/
`app-session-detail-modal.spec.ts` above — Radix's `Popover.Content` (the bell dropdown's underlying
primitive) also renders `role="dialog"` in the DOM, so the same crop approach carries over from a
`Dialog` unchanged. Parameterized: 3 breakpoints × 3 states = **9 test instances**,
`notification bell — ${state} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `empty` | `seedEmptyNotificationsOnNextLoad(mockSessionId)` (new MSW override, `notificationsEmpty`) before `seedAuthenticatedSession`, then click the bell | "You're all caught up." visible |
| `populated` | Default fixture (`defaultNotificationsState`, 2 unread + 5 read — was 2 + 1 before CLIENT-NOTIF-3 added two session types, then 2 + 3; CLIENT-NOTIF-5 added the two `user.friend_request.*` rows), click the bell | Aggregated-actor notification text visible |
| `with-load-more` | `seedPaginatedNotificationsOnNextLoad(mockSessionId)` (new fixture, 11 items — one more than the page size of 10) before seeding auth, click the bell, scroll the row list's internal scroll container so "Load more" clears the fold | "Load more" button visible |

Curated down from `NotificationBell`'s full 6 Storybook stories (user decision at pickup): `loading`/
`error` are transient states already covered by Storybook, and no other visual-regression spec in
this suite baselines a loading/error state either.

Same clock-freeze (all three fixtures' notification timestamps are in 2026-08, after the frozen
instant — `formatRelativeTime`'s negative-diff handling renders "just now" deterministically, same
accepted behavior `app-post-modal.spec.ts` documents for its own timestamps) / blur-before-screenshot
/ `document.fonts.ready` sequence and known-Windows-noise caveat as the specs above. Screenshots
compared against `e2e/visual/__screenshots__/notification-bell-{state}-{width}.png`.

### `e2e/visual/app-profile.spec.ts` (PROFILE-7, `visual-regression` project)

Full-page (not dialog-scoped, matching `app-groups.spec.ts`'s reasoning — this is a page), except the
`edit-profile-modal` state (dialog-scoped, matching `app-session-detail-modal.spec.ts`'s reasoning).
Parameterized: 3 breakpoints × 4 states = **12 test instances**, `profile — ${state} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `posts` | `seedAuthenticatedSession(page, '/profile')`, default landing tab | Posts tab selected, first article visible (`mockPost`/`mockGroupPost`, both mockUser's own, both Badminton — mockUser's first sport profile) |
| `memories` | Posts tab → Memories tab | "Memories" heading visible (`ComingSoonPage` placeholder — no backend concept exists yet) |
| `settings` | Posts tab → Settings tab | "Skill level" select visible (the per-sport profile editor, PROFILE-4/SPORT-2) — clean (non-dirty) state, Save stays disabled, so no PUT mutation handler is exercised |
| `edit-profile-modal` | Click "Edit profile" (`ProfileHeader`) | Dialog-scoped, "First name" field visible — never submitted, so no PUT mutation handler is exercised either |

**Real MSW gap found and fixed at pickup** (this ticket is the first to run the real `/profile` page
through Playwright — `PROFILE-8`, the E2E functional ticket, is still `TODO`): `GET /api/posts/mine`
didn't exist in `feed.ts` at all (added, filtered by `userId === mockUser.id`, placed before the
`:postId` catch-all — same literal-segment-first ordering rule as every other route there), and
`friends.ts`'s `GET /api/users/:userId` only ever returned the narrow `FriendUser` shape (fine for
looking up *other* users, but missing `firstName`/`lastName`/`username`/`city`/`country`/`createdAt`/
etc. that `useMyProfile`/`ProfileHeader`/`EditProfileModal` need for the caller's own profile) — now
special-cases the caller's own id to return a new `mockMyProfile` fixture (full `UserResponse`),
falling through to the existing narrow directory for every other id.

**Two real bugs found and fixed along the way, not just test-infra gaps:**
1. **Nested `<main>` landmark** — `MemoriesTab` mounts `ComingSoonPage` (whose only call site this now
   is, router-level usage having been removed since PROFILE-6) inside `ProfilePage`'s own `<main>`.
   `ComingSoonPage` no longer renders its own `<main>` (a `<div>` now) — invalid document structure
   otherwise (axe: `landmark-main-is-top-level`).
2. **Composer overflow at 375px** (`profile page @ 375px — no horizontal overflow` in `a11y.spec.ts`
   caught this) — `CreatePostForm`'s Photo/Location/Tag-sport/Post action row doesn't fit one line
   once a left tab rail (`ProfileTabs`, `w-37.5`) eats into a narrow viewport's width; the same
   pre-existing bug is reachable on the already-shipped Groups page too (`GroupTabs` is the same
   width), just never caught there since no overflow assertion was ever added for it. Fixed with the
   same `overflow-x-auto`/`shrink-0` idiom `NavTabs` already established (HF-8): the icon-button group
   scrolls within itself instead of pushing the Post button off-canvas or the page overflowing
   sideways. Verified via a stash/pop isolation that this fix causes no diff in Home Feed's or
   Groups' own already-committed baselines beyond pre-existing local Windows font-rendering noise
   (reproduced identically with the fix reverted) — not touched.

Every instance: freezes the clock (same instant as every other visual spec, for consistency — this
page renders no clock-sensitive content beyond the same `formatRelativeTime` negative-diff "just now"
every other spec's mockUser-authored fixtures already show) → waits for `document.fonts.ready` →
(`edit-profile-modal` only) blurs the autofocused field first, same `CLIENT-SESSION-12` reasoning →
screenshot compared against `e2e/visual/__screenshots__/profile-{state}-{width}.png`. Same
known-Windows-noise caveat as every spec above — these 12 baselines are Windows-rendered locally and
need the same `client-ci` `update-baselines` dispatch swap before merging.

---

## 7. Adding a new spec — checklist

- Import `{ test, expect }` from `../mocks/test.ts`, not `@playwright/test` directly, if the spec needs
  the mock backend.
- Need an authenticated session? `seedAuthenticatedSession(page, targetPath?)` from `fixtures.ts`.
- Need a non-default data state (empty feed, an error, expired session, zero sport profiles, a big
  paginated feed)? Use the matching `seed*OnNextLoad`/`simulate*OnNextLoad` helper — these need
  `mockSessionId` (destructure it from the test fixture), not `page`.
- Adding a genuinely new override case? Add a flag to `overrides.ts`'s `SessionOverrides`, wire the
  check into the relevant handler, add an admin route dispatch in `mockServer.ts`, add a `fixtures.ts`
  helper — follow the existing ones as the template.
- Adding new stateful mock data? Use `createSessionStore`, never a module-level `let` (see §2).
- Visual-regression spec touching a new page? Freeze the clock before the first navigation if the page
  renders any relative timestamp.
