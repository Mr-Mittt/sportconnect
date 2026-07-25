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
`seed-join-requests` admin route).

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
  { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI,
    env: { VITE_API_PROXY_TARGET: MOCK_SERVER_URL } },
],
```

1. **Mock server** (`e2e/mocks/mockServer.ts`) — plain `node:http` `createServer` + `.listen()`, no
   framework. Readiness probe: `GET /__mock/health` → `{"status":"ok"}`, answered the instant
   `.listen()`'s callback fires.
2. **Vite dev server** (`pnpm dev`) — same dev server a developer would run by hand, except Playwright
   passes it `VITE_API_PROXY_TARGET` pointing at the mock server. `vite.config.ts` reads that env var
   for its `/api` proxy target, falling back to `http://localhost:8080` (the real backend) when unset —
   so a bare `pnpm dev` run outside Playwright is completely unaffected by any of this.

`reuseExistingServer: !process.env.CI` — locally, if something is already answering on that URL (a
mock server you started by hand, or a leftover process from an earlier interrupted run), Playwright
reuses it instead of spawning a new one. In CI this is always `false`: CI always starts fresh.

**Gotcha, hit for real during MSW-1's own verification:** if a previous `pnpm e2e`/`pnpm dev` run gets
interrupted (Ctrl+C, crashed shell) without its child processes dying, `reuseExistingServer` will
happily reuse the stale one on the next run — including a *stale Vite instance still proxying to the
old target*, or one that grabbed a different port because 5173 was taken (`vite` silently tries
5174/5175/... next). Symptom: every request 500s with a generic Vite error page, not a mock-server
JSON error. Fix: `netstat -ano | findstr :5173` (or `:5174`/`:5175`/`:9876`) and kill the stragglers
before re-running.

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
    feed-groups-journey.spec.ts
    group-settings.spec.ts
    group-members.spec.ts
    group-invitations.spec.ts
    friends-journey.spec.ts
    msw-setup.spec.ts
    post-deep-link.spec.ts
  visual/                    # `visual-regression` project specs
    app-home-feed.spec.ts
    __screenshots__/         # committed baselines (Linux-rendered, see §6)
  mocks/
    mockServer.ts            # the standalone Node HTTP server
    mockServerConfig.ts       # shared port/URL/header-name constants
    sessionStore.ts           # generic per-session state map
    overrides.ts              # per-session error/empty/expired flags
    paginatedFeedFixture.ts   # the 21-post pagination fixture builder
    test.ts                   # custom `test` — session header wiring
    fixtures.ts                # shared mock data + spec-facing helper functions
    handlers/
      index.ts                 # combines all handler arrays
      auth.ts
      feed.ts
      groups.ts
      sport.ts
      friends.ts
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
| `mockPassword` | `password123` | |
| `mockSportProfiles` | Soccer(5)/Basketball(6)/Tennis(2) | **At the 3-sport cap** — any spec asserting `SportSwitcher`'s "Add sport" is `aria-disabled` relies on this |

Posts (all owned by `mockUser` unless noted) — `sportId` 5 = Soccer ("Football" pill in the UI, see
`sportIdMap.ts`'s naming note), 6 = Basketball:

| Fixture | id | Type | Notes |
|---|---|---|---|
| `mockPost` | 1 | `USER_FEED` | "Great match today! #fridayrun" — `likeCount: 3`, `commentCount: 1` |
| `mockGroupPost` | 2 | `GROUP_POST` | belongs to `mockGroup` |
| `mockBroadcastPost` | 3 | `GROUP_BROADCAST` | belongs to `mockGroup`, `broadcastEndTime: hoursFromNow(24)` (always active) |
| `mockBasketballPost` | 4 | `USER_FEED` | owned by **Priya Shah** (a friend, not `mockUser`) — the "no delete menu on someone else's post" case |
| `mockExpiredBroadcastPost` | 5 | `GROUP_BROADCAST` | belongs to `mockGroup`, `broadcastEndTime: hoursAgo(24)` — proves the expiry filter is real |

Groups:

| Fixture | id | sportId | `currentUserRole` | Notes |
|---|---|---|---|---|
| `mockGroup` | 1 | 5 (Soccer) | `group_member` | "Friday Night Football" |
| `mockOwnedGroup` | 3 | 2 (Tennis) | `group_owner` | "Weekend Tennis Ladder" — the owner/admin broadcast-toggle fixture, also GRP-2's Settings-tab fixture |
| `mockPublicGroup` | 2 | 6 (Basketball) | n/a (not joined) | "Riverside Hoopers" — the "request to join" fixture |

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
test user for `mockPublicGroup` ("Riverside Hoopers", Basketball, not yet joined), from **Priya
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
and `GET /users/search` for every id these fixtures reference, plus the Add-mode-only stranger below:

| Fixture | id | Notes |
|---|---|---|
| `mockFriend` | `priya-shah` | Same person as `mockComment`'s commenter — an accepted friend, renders under Offline (Online always empty, no presence system exists). GRP-4 reuses it as `group-members.spec.ts`'s invitable-friend fixture — not a member/not already invited to `mockOwnedGroup` |
| `mockIncomingFriendRequest` | `req-incoming-1`, sender `hana-kim` | Sent TO the test user — Friend Requests row + the profile panel's Accept/Decline action bar |
| `mockSentFriendRequest` | `req-outgoing-1`, receiver `diego-alvarez` | Sent BY the test user — Friend Requests row + the profile panel's disabled "Waiting for response" |
| `mockSearchResultUser` | `owen-clarke`, `friendshipStatus: 'NONE'` | Only reachable via Add mode's directory search, never in the default friend list |

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
| 1. load | Shell/switcher/feed/all 3 rail blocks render; 3 articles, 3 match CTAs, 1 trending row, 1 broadcast row | |
| 2. Basketball pill | Feed + Upcoming Matches filter to 1; Trending/Broadcasts **unchanged** | Trending/broadcasts are deliberately global, not sport-scoped (HF-5/HF-6 resolved open question) |
| 3. "All" | Filters clear back to 3 | |
| 4. like toggle | `likeCount` 3→4→3, `aria-pressed` flips | Optimistic — no network wait asserted |
| 5. hashtag click | Opens `HashtagPostsModal` with 2 matching posts (`mockPost`+`mockGroupPost`, both tagged `fridayrun`); reachable from both an inline post tag and the Trending row; Escape closes it; **no URL change** | Modal, not a route — user decision, see FEED-6's delta |
| 6. match CTAs | Both "open" and "full" variants clickable and distinguishable | No destination screen — matches backend doesn't exist yet, deliberate no-op |
| 7. "Add sport" | `aria-disabled="true"` | Relies on the fixture user being **at** the 3-sport cap |
| 8. delete | "..." menu only on the caller's own post (not Priya Shah's); delete removes it, count 3→2 | |

### `e2e/flows/a11y.spec.ts` (HF-8 + AUTH-6 + GRP-3 + FRIEND-1, several independent `test()`s)

| Test(s) | What it checks | Notes |
|---|---|---|
| `home feed @ {375,768,1280}px — no horizontal overflow` (×3) | `scrollWidth - clientWidth <= 0` | String-form `page.evaluate` — e2e tsconfig has no DOM lib |
| `home feed @ {375,768,1280}px — axe reports no critical/serious violations` (×3) | `axe-core` scan, filtered to `impact === 'critical' \| 'serious'` | Moderate/minor violations don't fail the gate |
| `sport-filtered state — axe reports no critical/serious violations` | Same axe gate after clicking Basketball (1 article) | |
| `groups page — Members tab (owner) — axe reports no critical/serious violations` | Same axe gate on the Groups page, `mockOwnedGroup` selected, Members tab active | GRP-3: the first Groups-page a11y coverage in this file — GRP-1/GRP-2 both claimed to extend this file but never actually added a Groups-page block. One check (owner role, 1280px, Members tab — the richest per-group tab) establishes a baseline rather than backfilling every tab/breakpoint retroactively |
| `friends page — friend selected — axe reports no critical/serious violations` | Same axe gate on the Friends page with `mockFriend` selected (profile + chat split, the richest state) | FRIEND-1: one check at 1280px, same "one representative state" scoping the Groups-page check above uses |
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

### `e2e/flows/feed-groups-journey.spec.ts` (FEED-10, one `test()` with 9 steps + 1 separate `test()`)

Uses `seedPaginatedFeedOnNextLoad(mockSessionId)` — replaces the feed with **21 posts** before the
first fetch (index 19 = a `GROUP_POST` for `mockGroup`, index 20 = Basketball, everything else Soccer).
This spec destructures `mockSessionId` directly (needed by the seed/override admin calls).

**Main test — `Feed/groups journey`:**

| Step | What it checks | Notes |
|---|---|---|
| 1. load + pagination | 20 articles (page 0) → "Load more" → 21 articles, Basketball post now visible, "Load more" button gone | Real second-page fetch, not a fixed 3-post fixture. Only clicks the button if it's still visible — `useInfiniteScrollSentinel`'s `IntersectionObserver` (200px `rootMargin`) can auto-fire the same fetch first under slow/contended rendering, a real race reproduced under parallel headless runs, not test flakiness to shrug off |
| 2. like toggle | `3→4→3` | Base `likeCount` inherited from `mockPost` by every seeded post |
| 3. add comment | Comment count `1→2`, appears in dialog | |
| 4. create post (simulated failure) | `simulateCreatePostFailOnce(mockSessionId)` first → first submit fails with error text, composer clears anyway → retry succeeds, count → 22 | FEED-10's required "at least one MSW-simulated error response" acceptance criterion |
| 5. switch to group feed | Click "Friday Night Football" (`mockGroup`) in `GroupSpaceSwitcher` → 1 article (the seeded GROUP_POST) | Scoped query — "Friday Night Football" also appears as a broadcast-rail row, an ambiguous unscoped match |
| 6. create a group | Back to "All" (group switcher) → `GroupDiscoveryPanel`'s "Create Group" button → "Sunday Runners" (no manual sport pick) → appears selected in switcher, "No posts yet for this sport." | GRP-1: `GroupSpaceSwitcher`'s own "Group options" dropdown was removed (redundant with the panel's Join/Create entry points) — the panel only renders in the "All" state, hence the extra click back. **GRP-8 delta:** step 5's group selection now also drives this page's own sport pill to Football (`groupsPageStore.selectGroup`'s derivation) — deselecting the *group* via the group switcher's "All" leaves the *sport* pill on Football, so `CreateGroupModal` opens already `lockedSport`-locked to it (no `#create-group-sport` select to interact with — asserts `toHaveCount(0)` instead of `selectOption`) |
| 7. Trending + Broadcasts | 1 trending row, 1 broadcast row (expired one excluded) | Unaffected by the postsState replacement — separate handler state |
| 8. Broadcast toggle permission | Absent for `mockGroup` (member) → reset sport pill to "All" → present for `mockOwnedGroup` (owner, Tennis) | **GRP-8 delta:** the group switcher list is sport-filtered by this page's own pill (unchanged design), which now reliably stays on Football from steps 5–6 — `mockOwnedGroup` ("Weekend Tennis Ladder", Tennis) isn't reachable in that filtered list until the sport pill is explicitly reset to "All" first |
| 9. SPORT-1 sport filter | Basketball pill → 1 article (the seeded index-20 post); back to All → 22 | Waits for Home Feed's own `<h1>` before clicking — `GroupsPage`/`HomeFeedPage` share `SportSwitcher`'s exact accessible name ("Sport filter" group), and under a slow route transition the previous page's pill can still be attached, so an unscoped click can silently land on the wrong page's button (reproduced under parallel headless runs) |

**Separate test — `zero sport profiles renders without error`:**

| Test | What it checks | Notes |
|---|---|---|
| zero sport profiles | `seedZeroSportProfilesOnNextLoad(mockSessionId)` → only "All" + "Add sport" render, 2 buttons total, no crash | SPORT-1's zero-profile edge case — can't coexist with the main journey's 3-sport-cap step 9, hence a separate test |

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
owner/admin approval-queue journey, and `mockPublicGroup` ("Riverside Hoopers", Basketball) via
`mockReceivedInvitation` for the invitee-facing acceptance journey.

| Test | What it checks | Notes |
|---|---|---|
| Merged approval queue shows both row types, approving an invitation only clears the queue row | A join request and a `pending_owner` invitation render together in "Waiting for group approve"; approving the invitation removes only that row (no member added — real semantics: approve just moves `pending_owner` → `pending_user`); the join request still accepts normally afterward | GRP-7 |
| Invitations section accepts an invitation and navigates into the new group, sport pill included | Accept → lands on the new group's Posts tab; **GRP-8 part 1**: `SportSwitcher`'s Basketball pill is now active (`aria-pressed="true"`) — no more forcing "All" first, since B15 added `sportId` to the invitation | Also asserts the merged-inviter copy: "Group invitation from Priya Shah" |
| A group selection on the Groups page survives switching sport on Home Feed, but not an explicit "All" click on the Groups page itself | Open a group (Tennis pill active) → switch to Home, click "All" there → back to Groups, group still open, pill still Tennis → click "All" directly on Groups → group deselected | Regression guard for the `homeFeedStore`/`groupsPageStore` split. Waits for Home Feed's own `<h1>` before touching its Sport filter — same shared-accessible-name race as `feed-groups-journey.spec.ts` step 9, reproduced under parallel headless runs |
| Invitations section is absent once there are none to show | Reject → **GRP-8 part 2**: opens `RejectInvitationConfirmDialog` first (optional reason, left empty here) → confirming inside the dialog removes the row | Exercises "reason is optional" (user decision) |
| Join requests section withdraws the current user's own pending request | `mockJoinRequest` seeded via a new admin route (`seed-join-requests` — no existing e2e coverage of `JoinGroupModal`'s search UI to drive instead) → "Riverside Hoopers" row visible with a "Withdraw" button → clicking it empties the section | **GRP-8 part 3** |
| Accepting an invitation for a sport the invitee lacks offers to add it first | Test user's sport profiles zeroed via `seedZeroSportProfilesOnNextLoad` → Accept → `AddSportIntroDialog` ("This Basketball group…", OK button) → `AddSportModal` pre-selected to Basketball → submitting adds the profile then accepts the invitation, landing on the new group's Posts tab | **GRP-8 part 5** |

### `e2e/flows/friends-journey.spec.ts` (FRIEND-1, one `test()` with 7 steps)

Uses `mockFriend` ("Priya Shah", Offline), `mockIncomingFriendRequest` ("Hana Kim" → the test user,
Friend Requests), `mockSentFriendRequest` ("Diego Alvarez", outgoing, also Friend Requests), and
`mockSearchResultUser` ("Owen Clarke", `friendshipStatus: 'NONE'`, Add-mode-only).

| Step | What it checks | Notes |
|---|---|---|
| 1. all 4 sections render | Online/Blocked "Nothing here yet." (no presence system/blacklist backend exists); Friend Requests shows Hana Kim; Offline shows Priya Shah | |
| 2. rail search filters in place | Typing "priya" narrows Offline to Priya Shah, empties Friend Requests to "No matches." | No debounce — this is the rail's local filter, not Add mode's directory search |
| 3. select an existing friend | Profile panel shows bio; chat panel visible; no "Send a friend request" button (`FRIENDS` status) | |
| 4. Add friend searches the real directory + sends a request | "Add friend" → type "Owen" → `Matches for "Owen"` → select → real `POST /users/friends/requests` → button flips to disabled "Waiting for response" | Exercises the debounced `GET /users/search` end-to-end, not MSW-bypassed |
| 5. clearing the search returns to the default list | "x" clear button exits Add mode, restores the unfiltered Offline section | |
| 6. accept moves the request | Select Hana Kim (Accept/Decline visible) → Accept → disappears from Friend Requests, appears in Offline | Exercises the stateful MSW accept handler (moves the row from `receivedRequestsState` into `friendsState`) |
| 7. mock chat doesn't persist across a selection | Send a message while Priya selected → visible; switch to Hana → message gone, "No messages yet." | `FriendChatPanel` remounts via `key={selectedPerson.id}` |

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

### `e2e/visual/app-home-feed.spec.ts` (HF-10b, `visual-regression` project)

Parameterized: 3 breakpoints × 3 states = **9 test instances**, `home feed — ${state.name} @ ${width}px`.

| State | Setup | Expects |
|---|---|---|
| `default` | `seedAuthenticatedSession(page, '/')` | First article visible |
| `basketball` | same + click Basketball pill | Exactly 1 article |
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
