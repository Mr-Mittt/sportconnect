# Client — Feature Backlog (SportHub rebuild)

**Version:** MVP v1  
**Module:** `client` (new SportHub app — the existing CRA app in this folder is being dropped and rebuilt, see `client/CLAUDE.md`)  
**Last updated:** 2026-08-07

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon client mvp` to resume

Full ticket specs live in the two epic docs in this folder — this backlog is the single ordered
queue across both, plus corrections found when the backlog was created (see "Reality check" below):

- `sporthub-home-feed-tickets.md` — HF epic (Home Feed screen)
- `sporthub-auth-feed-integration-tickets.md` — AUTH/FEED epic (real backend integration)

---

## Reality check at backlog creation (2026-07-06) — corrections to the epic docs

Verified against the actual backend source, not the docs:

1. **`SportController` now exists.** Both epic docs say the sport module "has no REST layer" and
   that the sport switcher "stays mock until a backend ticket adds the controller." That backend
   ticket happened — `modules/sport/sport-impl` shipped `SportController` (its backlog tickets
   A1–A4 are all `DONE`), including `GET /api/sports` and `GET /api/sports/profiles/user/{userId}`.
   The sport switcher **can** be de-mocked → new ticket **SPORT-1** below, not present in either epic.
2. **BE-1 (refresh token via httpOnly cookie) — SHIPPED 2026-07-08.** `POST /api/auth/refresh` now
   reads the token from an httpOnly `refreshToken` cookie (never the body); login/register/refresh
   set it via `Set-Cookie`. Tracked as **A2** in `modules/auth/docs/BACKLOG_MVP.md`, `DONE`.
   **AUTH-3 and AUTH-5 are unblocked.**
3. **BE-2 (logout authorization) — SHIPPED 2026-07-08.** `POST /api/auth/logout` now derives the
   caller from the `Authorization: Bearer` header — no `userId` param at all, 401 if
   missing/invalid. Tracked as **A3** in `modules/auth/docs/BACKLOG_MVP.md`, `DONE`. See
   AUTH-4's entry below for the exact new contract.
4. **Only matches/tournaments remain genuinely mock-only.** No backend module exists — HF-4 stays
   on `mockData.ts` through this entire MVP.
5. **Post-impl's old F1 ticket** ("Frontend — personalized feed", noted in
   `modules/social/post-impl/docs/BACKLOG_MVP.md` as moved here) is absorbed by **FEED-1** —
   it is not a separate ticket.

The AUTH/FEED epic is marked *"draft, for discussion once the Home Feed epic is finished"* — re-read
its "Backend reality check" section and re-verify BE-1/BE-2 status before starting Phase 5.

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| **Phase 0 — Foundations** | | | |
| 1 | HF-00 | Project scaffolding + tooling (Vite, TS, Tailwind, Storybook, Playwright) | `DONE` |
| 2 | HF-0 | Shared types + mock data layer | `DONE` |
| 3 | HF-10a | Visual-regression harness (baseline screenshots from reference HTML) | `DONE` |
| **Phase 1 — Core components (parallelizable after HF-0)** | | | |
| 4 | HF-1 | TopBar + NavTabs | `DONE` |
| 5 | HF-2 | SportSwitcher | `DONE` |
| 6 | HF-3 | PostCard + Feed | `DONE` |
| 7 | HF-4 | UpcomingMatches | `DONE` |
| 8 | HF-5 | TrendingHashtags | `DONE` |
| 9 | HF-6 | GroupBroadcasts | `DONE` |
| **Phase 2 — Page integration** | | | |
| 10 | HF-7 | HomeFeedPage — layout, state wiring, data hook | `DONE` |
| **Phase 3 — Hardening** | | | |
| 11 | HF-8 | Responsive + accessibility pass | `DONE` |
| 12 | HF-10b | Full-page visual regression + CI gate | `DONE` |
| 13 | HF-11 | E2E functional test — Home Feed journey | `DONE` |
| **Phase 4 — Home Feed release readiness** | | | |
| 14 | HF-9 | QA / acceptance checklist (Home Feed) | `DONE` |
| 14b | HF-12 | CI bootstrap + first green run (follow-up from HF-9 item 7) | `DONE` |
| 14c | HF-13 | Regenerate visual-regression baselines (follow-up from AUTH-1's cn() border-hairline fix) | `DONE` |
| 14d | HF-14 | Regenerate visual-regression baselines (follow-up from AUTH-4's TopBar avatar-menu change) | `DONE` |
| 14e | HF-15 | Regenerate visual-regression baselines (follow-up from FEED-1's real feed + delete menu) | `DONE` |
| 14f | HF-16 | Regenerate visual-regression baselines (follow-up from FEED-2's comment button + dialog) | `DONE` |
| 14g | HF-17 | Regenerate visual-regression baselines (follow-up from FEED-6's real trending hashtags) | `DONE` |
| 14h | HF-18 | Regenerate visual-regression baselines (follow-up from FEED-7's real group broadcasts) | `DONE` |
| 14i | HF-19 | Regenerate visual-regression baselines (follow-up from GRP-6's app-wide Dialog position/size changes) | `DONE` |
| **Phase 5 — Auth integration (epic is draft — review first; BE-1/BE-2 shipped 2026-07-08, no longer blocking)** | | | |
| 15 | MSW-0 | Mock Service Worker handler setup | `DONE` |
| 16 | AUTH-0 | Types, API client, auth store | `DONE` |
| 17 | AUTH-1 | Login | `DONE` |
| 18 | AUTH-2 | Register | `DONE` |
| 19 | AUTH-3 | Session bootstrap on app load | `DONE` |
| 20 | AUTH-4 | ProtectedRoute + logout | `DONE` |
| 21 | AUTH-5 | 401 refresh-retry interceptor | `DONE` |
| 22 | AUTH-6 | Auth hardening (errors, rate-limit messaging, a11y) | `DONE` |
| 23 | AUTH-8 | E2E functional test — auth journey | `DONE` |
| 24 | AUTH-7 | QA / acceptance checklist (auth) | `DONE` |
| **Phase 6 — Feed/groups/sport integration (de-mocks HF-2/3/5/6)** | | | |
| 25 | FEED-0 | Types + TanStack Query hooks scaffold | `DONE` |
| 26 | FEED-1 | Feed + PostCard (real — absorbs post-impl's old F1) | `DONE` |
| 27 | FEED-2 | CommentSection (real) | `DONE` |
| 28 | FEED-3 | CreatePostForm (real) | `DONE` |
| 29 | FEED-4 | Group switching (real groups list) | `DONE` |
| 30 | FEED-5 | CreateGroupModal + JoinGroupModal (real) | `DONE` |
| 31 | FEED-6 | TrendingHashtags (real) — de-mocks HF-5 | `DONE` |
| 32 | FEED-7 | GroupBroadcasts (real) — de-mocks HF-6 | `DONE` |
| 33 | SPORT-1 | Sport switcher (real) — de-mocks HF-2, **new ticket, not in the epics** | `DONE` |
| 34 | FEED-8 | Integration hardening (loading/error/empty states, pagination edges) | `DONE` |
| 35 | FEED-10 | E2E functional test — feed/groups journey | `DONE` |
| 36 | FEED-9 | QA / acceptance checklist (integration) | `DONE` |
| 37 | MSW-1 | Standalone mock server for e2e — replaces per-navigation Service Worker setup | `DONE` |
| 38 | FEED-12 | Comment modal fetches its own post + URL-addressable deep link — **new ticket, not in either epic** | `DONE` |
| 39 | FEED-11 | Visual regression harness for the post comment modal — **new ticket, not in either epic** | `DONE` |
| **Phase 7 — Groups page epic (new, not in either epic — see deferred-items table below)** | | | |
| 40 | GRP-1 | Group page restructure — cover banner, Posts/Chat/Settings tabs, inline discovery panel | `DONE` |
| 41 | GRP-2 | Adapt Settings tab to the full group settings data set — blocked on B7 (group-impl) | `DONE` |
| 42 | GRP-3 | Members tab — group member management (search, invite, 5 status-grouped lists) | `DONE` |
| 43 | GRP-6 | Join Group modal — multi-select sport filter + grouped results — **new ticket, not in either epic, supersedes GRP-5** | `DONE` |
| 44 | FRIEND-1 | Friends page — rail, profile/chat panel, directory search, friend-request actions — **new ticket, not in either epic**, inserted ahead of GRP-4 (user decision, 2026-07-22) | `DONE` |
| 45 | GRP-4 | Wire invite-friend search to the real backend — blocked on GRP-3, unblocked now that FRIEND-1 is `DONE` | `DONE` |
| 46 | GRP-5 | ~~Join Group modal — show the active sport filter~~ — **SUPERSEDED by GRP-6** | `SUPERSEDED` |
| 51 | GRP-7 | Wire the invitation approve/accept lifecycle — owner/admin approval + invitee acceptance — **new ticket, not in either epic, found while closing out GRP-4** (2026-07-23) — blocked on backend B11 | `DONE` |
| 52 | GRP-8 | Sport pill follows an opened group + merged multi-inviter display (invitee + owner/admin views) + reason-gated invitation reject + join-request withdraw + sport-add confirmation on accept — **new ticket, not in either epic, filed while using GRP-7's shipped lifecycle, amended same day** (2026-07-24) — backend B13/B14/B15 all shipped, no longer blocking | `DONE` |
| **Phase 8 — Chat — ARCHIVED (2026-07-26, user decision, see `documentation/md/archive/chat/`) — fresh re-plan pending** | | | |
| **Phase 9 — Direct messaging — ARCHIVED (2026-07-26, user decision, see `documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`) — folded into the fresh chat re-plan** | | | |
| **Phase 10 — Session & Location UI (new, not in either epic — backend done 2026-07-30, see `documentation/md/SESSION_LOCATION_DESIGN.md`)** | | | |
| 53 | CLIENT-LOC-1 | `LocationPicker` component — search, Google-Maps-link paste-and-resolve, OSM/Leaflet preview pin, Get Directions | `DONE` |
| 54 | CLIENT-SESSION-1 | Session create/list/join/leave/cancel UI, de-mocks HF-4 (`UpcomingMatches`) | `DONE` |
| **Phase 11 — Session UX follow-ups (new, not in either epic, filed 2026-08-01)** | | | |
| 55 | CLIENT-SESSION-2 | Standalone-only `CreateSessionModal` redesign (core fields) | `DONE` |
| 56 | CLIENT-SESSION-3 | Capacity + fee/pricing fields in `CreateSessionModal` (SESSION-5) | `DONE` |
| 57 | CLIENT-SESSION-4 | Invite-friends + auto-approve at creation, plus approval queue UI (SESSION-6) | `DONE` |
| 58 | CLIENT-SESSION-5 | Favorite locations — heart-toggle + `CreateSessionModal` favorites dropdown (LOC-2) | `DONE` |
| 59 | CLIENT-SESSION-6 | Standalone session discover — real "Join a match" browse UI (SESSION-4) | `DONE` |
| 60 | CLIENT-SESSION-7 | Upcoming rail create/join CTAs + create-session hook extraction across pages | `DONE` |
| 61 | SPORT-3 | Sport catalog — fetch the real `GET /api/sports` list instead of the hardcoded 3-sport config (A6) — **reordered ahead of SPORT-2/CLIENT-SESSION-8, user decision 2026-08-07** | `DONE` |
| 62 | SPORT-2 | Static per-sport attribute config + `SportAttributesFields` component | `TODO` |
| 63 | CLIENT-SESSION-8 | Session comments — discussion section in `SessionDetailModal` (SESSION-10) | `TODO` |

**Dependencies:**
```
HF-00 → everything
HF-0, HF-10a → HF-1..HF-6 (components need types; parallel with each other)
HF-1..HF-6 → HF-7 → HF-8, HF-10b, HF-11 → HF-9
Phase 5 is independent of Phases 1–4 code-wise but the epic says to finish Home Feed first.
MSW-0 ∥ AUTH-0 → AUTH-1..AUTH-6 → AUTH-8 → AUTH-7
AUTH-3, AUTH-5, AUTH-4 → previously blocked on auth backlog A2/A3 — BOTH SHIPPED 2026-07-08,
  no longer blocking. Build against the cookie-based /refresh contract and the param-less
  /logout contract (see AUTH-3/AUTH-4/AUTH-5 entries below).
Phase 5 → all of Phase 6
FEED-0 → FEED-1..FEED-7, SPORT-1 → FEED-8 → FEED-10 → FEED-9
FEED-2 → FEED-12 → FEED-11 (FEED-12 decouples the comment modal from the feed's loaded-post cache
  and makes it URL-addressable; FEED-11's visual-regression spec is simpler once it can just
  page.goto() a post URL instead of clicking through the feed — sequence FEED-12 before FEED-11,
  though FEED-11 doesn't hard-block on it if picked up first).
HF-4 (matches) is NOT de-mocked by any Phase 0–9 ticket — see Phase 10 below, added once the
  Session/Location backend shipped (2026-07-30).
CLIENT-LOC-1 → CLIENT-SESSION-1 (session forms need the location picker before they can go real).
  Both depend on the now-`DONE` backend: `modules/location`, `modules/session`
  (`docs/BACKLOG_MVP.md` in each) and GROUP-RECUR-1 (`modules/social/group-impl/docs/BACKLOG_MVP.md`).
CLIENT-SESSION-1 → CLIENT-SESSION-2 (redesigns the modal CLIENT-SESSION-1 built). CLIENT-SESSION-2
  itself has no backend dependency — see `client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`.
  **Delta (2026-08-03):** originally split out four backend-dependent fields as "not yet filed"
  follow-ups (SESSION-4/5/6, LOC-2 all still `TODO` in their module backlogs when this ticket was
  written 2026-08-01). All four shipped backend-side 2026-08-01/02 — at pickup, filed as four
  concrete client tickets rather than left unfiled, and split from CLIENT-SESSION-2 rather than
  folded into one giant ticket (this repo's established pattern for large scopes, e.g. GRP-1..GRP-8):
  CLIENT-SESSION-3 (capacity/fee, SESSION-5), CLIENT-SESSION-4 (invite-friends + auto-approve at
  creation + the approval queue UI, SESSION-6), CLIENT-SESSION-5 (favorite locations, LOC-2),
  CLIENT-SESSION-6 (real discover/browse UI, SESSION-4). CLIENT-SESSION-2 → all four (each extends
  the modal CLIENT-SESSION-2 builds); no dependency among 3/4/5/6 themselves.
  **Delta (2026-08-03, at close-out):** this ticket's own original scope also included Point 1 —
  `UpcomingMatches`'s empty-state rail CTAs and extracting the create-session hook out of
  `useMatchesPageData` so Home Feed/Groups/Friends/Matches share one modal instance. That work
  wasn't started this session (user decision: build the modal redesign — Point 2 — first) and is
  split out as its own ticket, **CLIENT-SESSION-7**, rather than leaving it as an unstarted part of
  an otherwise-`DONE` ticket. CLIENT-SESSION-2 → CLIENT-SESSION-7 (the hook it extracts wraps the
  now-`DONE` modal).
SESSION-10 (`modules/session/docs/BACKLOG_MVP.md`, backend, `TODO`) → CLIENT-SESSION-8 (the comment
  section needs the backend endpoints before it can go real; filed together from the same
  `/vision` session, see `documentation/md/vision/SESSION_COMMENTS_VISION.md`).
SPORT-3 (new, filed 2026-08-07) — soft dependency on **A6** (`modules/sport/sport-impl/docs/BACKLOG_MVP.md`,
  `DONE` 2026-08-07): SPORT-3 works against whatever `GET /api/sports` returns at pickup time either
  way (it's already active-filtered server-side), but the two tickets were scoped together — A6 is
  what shrinks the real active catalog down to Badminton + Pickleball, which is the concrete case
  SPORT-3's design needs to render correctly (neither sport exists in today's hardcoded `SportKey`
  set). No code dependency; A6 shipping first just means SPORT-3 is tested against the real target
  catalog instead of a hypothetical one.
**Reordered ahead of SPORT-2/CLIENT-SESSION-8 (user decision, 2026-08-07):** now A6 is `DONE`, the
  live catalog only has 2 sports and neither is selectable in the client yet — user wants this closed
  before picking up anything else client-side, rather than leaving the mismatch open while SPORT-2/
  CLIENT-SESSION-8 (both independent of SPORT-3) get picked up first. No dependency change, just
  queue-order priority.
FEED-4, FEED-5 → GRP-1 (Groups page epic; independent of Phase 6's other tickets).
GRP-1, B7 (modules/social/group-impl/docs/BACKLOG_MVP.md) → GRP-2.
GRP-1 → GRP-3 → GRP-4. GRP-3's "Waiting for user accept" section was blocked on B8
  (modules/social/group-impl/docs/BACKLOG_MVP.md) — B8 shipped 2026-07-20, no longer blocking.
GRP-6 (new, filed 2026-07-21) is independent of GRP-4 — inserted ahead of it in queue order (user
  decision) since it's a self-contained JoinGroupModal enhancement, not because of a code
  dependency. Supersedes GRP-5 (see GRP-5's entry) — GRP-5 is not picked up.
GRP-6 → was blocked on A10 (modules/social/group-impl/docs/BACKLOG_MVP.md — adds a multi-value
  sportIds filter to GET /api/groups/public). Discovered mid-pickup (2026-07-21): the client's
  original plan (fan out one request per selected sport) was reversed by user decision in favor of
  a real backend multi-sportIds filter — simpler client state (one query, one loading/error pair)
  at the cost of a small additive backend change. A10 shipped 2026-07-21 — GRP-6 is unblocked.
CHAT-1/CHAT-2/CHAT-3/CHAT-4 — moved to V1 in full 2026-07-26, then **archived in full 2026-07-26**
  (user decision) pending a fresh chat re-plan, see `documentation/md/archive/chat/`. No MVP ticket
  depends on any of them — GroupChatTab already ships (GRP-1) as a local-state-only mock with an
  explicit "not saved" disclaimer, which is sufficient for MVP.
FRIEND-1 (new, filed 2026-07-22) has no hard code dependency — U1 (friendship system) and U6 (user
  search), the two backend pieces it needs, both shipped long ago
  (modules/user/user-impl/docs/BACKLOG_MVP.md). **Inserted ahead of GRP-4 by user decision**: GRP-4
  was picked up first, but its invite flow requires the invitee already be the inviter's friend
  (A6's areFriends gate), and there was no client-side way to become someone's friend at all before
  this ticket — GRP-4 was reverted from IN PROGRESS back to TODO once this gap surfaced mid-pickup.
  GRP-4 should be picked up only after FRIEND-1 ships.
DM-1 (backend)/DM-2 (client) were filed alongside FRIEND-1, same lineage as CHAT-1/CHAT-2 but for
  1:1 chat instead of group chat — **archived in full 2026-07-26** (user decision) alongside
  CHAT-1..4, see `documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`. Neither had any code written;
  FRIEND-1's `FriendChatPanel` keeps shipping as a local-state mock unaffected by the archival.
GRP-7 (new, filed 2026-07-23) — GRP-3, GRP-4 (both DONE). Discovered while closing out GRP-4: an
  invitation GRP-4 sends can never be approved/accepted through the app today (the create step is
  the only one wired) — this ticket wires the remaining owner-approval + invitee-acceptance steps.
  Two design questions (section layout for owner approval, exact invitee-side placement/post-accept
  behavior) were resolved during pickup (merged chronological list; GroupDiscoveryPanel's "All
  groups" view; auto-navigate on accept) — see the ticket entry. **Reverted from IN PROGRESS back to
  TODO (2026-07-23)**: picking it up surfaced three unhandled race conditions between the two tables
  (an invitation and a join request converging on the same person) that the current backend doesn't
  resolve correctly — same "no client-side way to do the thing correctly yet" pattern GRP-4 hit with
  FRIEND-1. Filed as backend ticket **B11**
  (`modules/social/group-impl/docs/BACKLOG_MVP.md`) and inserted as this ticket's blocker. Pick up
  GRP-7 again only after B11 ships. Background: `documentation/md/adr/JOIN_GROUP_ADR.md` (schema/
  use-case reference for both tables, written during this same pickup).
GRP-8 (new, filed 2026-07-24, amended same day) — GRP-3, GRP-4, GRP-7 (all DONE), no code dependency
  on any of the three, just built on top of what they shipped. Five gaps found/added the same day
  using the Groups page after GRP-7 landed — see the ticket entry's Origin list. Parts 1 and 3 (the
  sport-pill fix and the new join-request withdraw section) have no backend dependency and can ship
  immediately. Part 2 (invitee-side merged invitations + reason-gated reject) and part 4 (the
  Members-tab approval queue's identical merged-display gap) both need backend ticket **B14**
  (`modules/social/group-impl/docs/BACKLOG_MVP.md`, `TODO`) — tracks every co-inviter against one
  canonical invitation row instead of allowing the multi-row/bulk-action design that would reintroduce
  B11's race class — plus **B13** (already filed) for the reject-reason persistence specifically. Part
  5 (sport-add confirmation on accept) needs **B15** (same file, `TODO`) — adds `sportId`/`sportName`
  to `GroupInvitationResponse`, which part 1's accept-invitation exception also benefits from. Split
  any part into its own follow-up if its backend dependency isn't ready by pickup, same "ship the
  unblocked part, split the rest" precedent GRP-1/GRP-2 and GRP-3/GRP-4 already used.
```

**Backend blockers (tracked outside this backlog):**

| Blocker | Where tracked | Blocked | Status |
|---|---|---|---|
| BE-1: refresh token → httpOnly cookie | `modules/auth/docs/BACKLOG_MVP.md` · A2 | AUTH-3, AUTH-5 | `DONE` (2026-07-08) |
| BE-2: logout derives user from principal | `modules/auth/docs/BACKLOG_MVP.md` · A3 | AUTH-4 (production) | `DONE` (2026-07-08) |
| BE-3: login/registration rate limiting | `modules/auth/docs/BACKLOG_MVP.md` · A5 | a future client ticket (not yet filed) for rate-limit error surfacing, split out of AUTH-6 on 2026-07-12 | `TODO` |
| Matches/tournaments module — `modules/session` + `modules/location` | `modules/session/docs/BACKLOG_MVP.md` (SESSION-1/2/3), `modules/location/docs/BACKLOG_MVP.md` (LOC-1), `modules/social/group-impl/docs/BACKLOG_MVP.md` (GROUP-RECUR-1) | de-mocking HF-4 | `DONE` (2026-07-30) |
| SESSION-4: standalone session discovery | `modules/session/docs/BACKLOG_MVP.md` · SESSION-4 | CLIENT-SESSION-6 — real "Join a match" Discover surface | `DONE` (2026-08-02) |
| SESSION-5: session capacity + fee/pricing | `modules/session/docs/BACKLOG_MVP.md` · SESSION-5 | a future client ticket (not yet filed) — capacity/fee fields in `CreateSessionModal` + display | `DONE` (2026-08-02) |
| SESSION-6: join-approval workflow + invite-friends-at-creation | `modules/session/docs/BACKLOG_MVP.md` · SESSION-6 | CLIENT-SESSION-4 — invite/auto-approve UI + approval queue | `DONE` (2026-08-02) |
| LOC-2: favorite locations | `modules/location/docs/BACKLOG_MVP.md` · LOC-2 | a future client ticket (not yet filed) — favorite heart toggle + `CreateSessionModal` favorites dropdown | `DONE` (2026-08-01) |
| SESSION-9: expose the caller's own participant status via getSessionParticipants | `modules/session/docs/BACKLOG_MVP.md` · SESSION-9 | a future client ticket (not yet filed) — `SessionDetailModal`'s Join/Leave button needs to become 4-state (Join/Leave/"Accept this session"/"Waiting for approval") based on the caller's own status; scoped down from CLIENT-SESSION-4 to just this (user decision, 2026-08-03) — CLIENT-SESSION-4's invite-UI + approval-queue scope is unaffected, still `TODO` | `TODO` |
| ~~Chat module (new `modules/social/chat-impl`, never existed beyond a docs folder, since deleted)~~ | ARCHIVED (2026-07-26) — see `documentation/md/archive/chat/` — fresh chat re-plan pending | ~~CHAT-2, CHAT-4~~ | `N/A` |

---

## Tickets

Phases 0–4: full specs in `sporthub-home-feed-tickets.md`. Phases 5–6: full specs in
`sporthub-auth-feed-integration-tickets.md`. Entries below are summaries plus any delta/correction
discovered since the epics were written — the epic doc is the spec, this file is the queue.

### HF-00 · Project scaffolding and tooling setup
**Status:** `DONE` (2026-07-06) · **Type:** Infrastructure · **Spec:** HF epic § HF-00 ·
**Summary:** `client/docs/HF-00_PROJECT_SCAFFOLDING.md`

Vite + React 18 + TS strict, Tailwind theme mapped 1:1 to the mockup's design tokens, React Router
with stub routes, Vitest/RTL, Storybook, Playwright (own config). Pure scaffolding, no feature code.
Decisions: pnpm; re-wired into Gradle (`./gradlew :client:buildClient`); shadcn/ui deferred to HF-1.

**Deltas for later tickets:**
- Tailwind is **v4** — tokens live in the `@theme` block of `src/index.css`, not `tailwind.config.ts`
  as the epic text says. Token utility classes double the prefix: `text-text-primary`,
  `border-border-strong`, `bg-bg-accent`.
- Default Tailwind `teal`/`purple` scales are cleared — only the approved ramp steps (50/800) compile.
- ESLint is v9 (jsx-a11y doesn't support v10 yet); react-hooks flat preset is `configs.flat.recommended`.

### HF-0 · Shared types and mock data layer
**Status:** `DONE` (2026-07-06) · **Type:** Foundation · **Dependency:** HF-00 · **Spec:** HF epic § HF-0 ·
**Summary:** `client/docs/HF-0_SHARED_TYPES_AND_MOCK_DATA.md`

`src/features/home-feed/types.ts` (`SportKey`, `SportProfile`, `Post`, `UpcomingMatch`,
`TrendingHashtag`, `GroupBroadcast`) + `mockData.ts`. Per the epic's scope update, mock data is a
temporary stand-in for everything except matches — and with SPORT-1 now real (see Reality check),
matches are the only piece whose mock survives this MVP.

**Deltas for later tickets:**
- Mock timestamps are computed from load time (`hoursAgo()`/`hoursFromNow()` in `mockData.ts`),
  not hardcoded — don't assert exact timestamp values in tests, assert relative behavior.
- `mockSportProfiles` has no synthetic `'All'` entry (HF-2's component adds it) and `icon` values
  are bare names (`ball-football`), not `ti-` CSS classes.
- Hashtags include the `#` prefix in both `Post.hashtags` and `TrendingHashtag.tag`.
- `mockData.test.ts` encodes HF-0's coverage acceptance criteria — extend it if you extend the data.

### HF-10a · Visual-regression harness setup
**Status:** `DONE` (2026-07-06) · **Type:** Infrastructure (Testing) · **Dependency:** HF-00 ·
**Spec:** HF epic § HF-10a · **Summary:** `client/docs/HF-10a_VISUAL_REGRESSION_HARNESS.md`

Check `design-reference-home-feed.html` into `design-reference/`, capture committed baseline
screenshots at 375/768/1280px × three states (all / sport-filtered / empty). No app-code dependency.

**Deltas for later tickets:**
- Reference now lives at `client/design-reference/design-reference-home-feed.html` (epic text says
  `client/docs/`). Icon font is vendored under `design-reference/assets/tabler/` — the mockup's
  original CDN link was a 404, so the committed baselines render icons the approved mockup didn't.
- Baselines: `e2e/visual/__screenshots__/home-feed-<state>-<width>.png`. **HF-10b must reuse these
  exact snapshot names** (the `visual-regression` project's `snapshotPathTemplate` makes names
  test-agnostic) to diff the real page against them.
- Baselines were rendered on Windows — regenerate once on Linux when CI is introduced (no CI exists
  repo-wide yet; the required-check gate is HF-10b's deliverable).

### HF-1 · TopBar + NavTabs
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-1 ·
**Summary:** `client/docs/HF-1_TOPBAR_NAVTABS.md`

Presentational, controlled; keyboard accessible; `aria-current="page"` on the active tab. These are
cross-page shell components — build in `src/shared/`, not inside the home-feed feature folder
(per `client/CLAUDE.md`).

**Deltas for later tickets:**
- shadcn foundation exists now: `cn()` at `@/shared/lib/utils`, Button/Avatar at `@/shared/ui/`
  (token-styled), `components.json` + `@/` alias configured — use `pnpm dlx shadcn@latest add <x>`
  or hand-write in the same idiom. Icons come from `@tabler/icons-react` only.
- New design-system pieces in `src/index.css`: `border-hairline` utility (the 0.5px rule),
  `max-w-frame` (960px), `text-2xs` (11px), `text-2sm` (13px) — use these, not arbitrary values.
- An `AppShell` layout route already renders TopBar + NavTabs around every page — HF-7 must NOT
  re-add them on the page; it only assembles the home-feed content area.
- RTL `cleanup()` runs from `src/test/setup.ts` (Vitest has no globals here — don't remove it).

### HF-2 · SportSwitcher
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-2 ·
**Summary:** `client/docs/HF-2_SPORTSWITCHER.md`

Controlled pill row ("All" + up to `maxSports=3` sports + dashed "Add sport"). Also a shared
component (`src/shared/`). The 3-sport cap is a real backend rule — `createProfile` rejects a 4th
active profile — so keep the default at 3. Builds against mock sport profiles; de-mocked by SPORT-1.

**Deltas for later tickets:**
- **Cap behavior changed from the spec (user decision):** "Add sport" is ALWAYS rendered (mockup/
  baseline parity); at the cap it's `aria-disabled` + no-op instead of hidden. Epic's "not rendered
  at max" is superseded.
- Epic open question #2 (wrap vs scroll) resolved: pills **wrap** (`flex-wrap`).
- `SportKey`/`SportProfile` now live in `@/shared/types/sport` (feature `types.ts` re-exports).
- `getSportIcon()` in `@/shared/lib/sportIcons.ts` maps icon names → Tabler components — HF-3's
  sport badge and HF-4's match rows must reuse it, not redefine the mapping.
- `colorRamp` is deliberately unused in the switcher (mockup pills are neutral) — ramps are for
  badges/avatars in HF-3/HF-4/HF-6.

### HF-3 · PostCard + Feed
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-3 ·
**Summary:** `client/docs/HF-3_POSTCARD_FEED.md`

Filterable post list, optimistic like toggle, clickable hashtags, empty state per sport, relative
timestamps via a date lib. Builds against mock data; de-mocked by FEED-1 before ship.

**Deltas for later tickets:**
- **Like state is controlled** (CLAUDE.md wins over the epic's local-optimistic wording): PostCard
  renders from props; the parent hook owns the flip. FEED-1 implements optimism in the mutation.
- **date-fns** is the date lib; use `formatRelativeTime()` from `@/shared/lib/relativeTime` for all
  relative timestamps (HF-6 broadcasts included) — don't format ad hoc.
- **Ramp classes**: use `getRampBadgeClasses()` from `@/shared/lib/rampStyles` — template-string
  classes like `bg-${ramp}-50` generate no CSS (Tailwind static scanning).
- **Hairline borders**: new `border-hairline-t` / `border-hairline-b` utilities; NEVER combine
  `border-hairline` with `border-t/b` (stacks 0.5px all-sides + 1px directional — this bug was also
  fixed retroactively in HF-1's NavTabs).

### HF-4 · UpcomingMatches
**Status:** `DONE` (2026-07-06) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-4 ·
**Summary:** `client/docs/HF-4_UPCOMINGMATCHES.md`

Right-rail block, filters by `activeSport`, "spots left, join" vs "Full, view details" CTAs
(distinguishable without color). **Stays mock for the whole MVP** — no matches backend exists.

**Deltas for later tickets:**
- **Cap resolved (user decision):** at most 4 matches render after filtering; the rest are behind
  "See all". Exposed as `maxVisible?: number` (default 4) beyond the spec's prop list.
- `formatStartTime()` in `@/shared/lib/startTime.ts` formats *future* timestamps ("Today/Tomorrow,
  7:00 PM" → weekday < 7 days → date). The future Matches screen must reuse it, not re-format;
  `formatRelativeTime` remains past-only.
- CTA buttons carry `aria-label` = `"{title} — {ctaText}"` — keep this pattern when the Matches
  page renders similar cards.

### HF-5 · TrendingHashtags
**Status:** `DONE` (2026-07-07) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-5 ·
**Summary:** `client/docs/HF-5_TRENDINGHASHTAGS.md`

Tag + post-count rows, caller-provided order. Real endpoint already exists
(`GET /api/hashtags/trending`); de-mocked by FEED-6.

**Deltas for later tickets:**
- **Epic open question #1 resolved (user decision): trending stays global** — no `activeSport`
  prop. If FEED-6's real endpoint introduces sport-aware trending, that's a FEED-6 design point,
  not a regression here.
- Empty state exists: header + muted "Nothing trending right now." — FEED-6 should map an empty
  200 response to this, not hide the card.
- Rows report tags **with the `#` prefix** (`onHashtagClick('#tournament')`), same as PostCard's
  hashtag callback — HF-7 can share one handler for both.

### HF-6 · GroupBroadcasts
**Status:** `DONE` (2026-07-07) · **Type:** Component · **Dependency:** HF-0 · **Spec:** HF epic § HF-6 ·
**Summary:** `client/docs/HF-6_GROUPBROADCASTS.md`

Group avatar + name + line-clamped message rows. Real endpoint already exists
(`GET /api/posts/broadcast` — broadcasts are `Post` rows with `postType=GROUP_BROADCAST`);
de-mocked by FEED-7.

**Deltas for later tickets:**
- **Rows are clickable buttons (user decision, spec wins over mockup's static divs)** —
  `onBroadcastClick(broadcastId)`; HF-7 must wire a handler even if it's a no-op for now.
- **Epic open question #1 resolved for broadcasts too: global**, no `activeSport` prop (matches
  the HF-5 resolution).
- Empty state exists: header + muted "No broadcasts from your groups." — FEED-7 maps an empty
  response here, doesn't hide the card.
- **CSS trap (joins HF-3's list): never combine `line-clamp-*` with `block`** — `display: block`
  overrides line-clamp's `-webkit-box` and silently disables clamping, regardless of class order.

### HF-7 · HomeFeedPage — layout, state wiring, data hook
**Status:** `DONE` (2026-07-07) · **Type:** Integration · **Dependency:** HF-1..HF-6 · **Spec:** HF epic § HF-7 ·
**Summary:** `client/docs/HF-7_HOMEFEEDPAGE.md`

Two-column layout, `useHomeFeedData()` hook boundary, `activeSport` state shared by SportSwitcher /
Feed / UpcomingMatches in one render pass. Per `client/CLAUDE.md`, move `activeSport` from page-local
state into the Zustand store as soon as a second page needs it.

**Deltas for later tickets:**
- **Hook shape supersedes the epic's flat sketch:** `useHomeFeedData()` returns
  `{ data: {…5 datasets}, isLoading, isError, toggleLike }` (CLAUDE.md convention). FEED-0/1/6/7
  and SPORT-1 swap internals behind this exact seam; the page must not change.
- **Rail-stacking breakpoint = md (768px)** — chosen as the starting point (spec left it open);
  HF-8 owns confirming/adjusting it.
- `isLoading`/`isError` are hardcoded false and unrendered — skeleton/error UI is FEED-8, not a
  gap in HF-7.
- Page-level tests must scope rail assertions via `within(getByRole('region', { name }))` —
  `#fridayrun` exists in both a post and the trending card.
- `App.test.tsx`'s "/" route test now asserts the assembled page (the placeholder-heading premise
  died with the placeholder).

### HF-8 · Responsive and accessibility pass
**Status:** `DONE` (2026-07-07) · **Type:** Hardening · **Dependency:** HF-7 · **Spec:** HF epic § HF-8 ·
**Summary:** `client/docs/HF-8_RESPONSIVE_A11Y_PASS.md`

375/768/1280px, pill wrapping, WCAG AA contrast on all sport-ramp combinations, full keyboard nav,
axe scan with no critical/serious violations.

**Deltas for later tickets:**
- **`--color-text-muted` is now #6e6d66** (was the mockup's #888780 — 3.4:1, failed AA). The
  reference HTML was updated to match and **all 9 HF-10a baselines were regenerated** — HF-10b
  diffs against the regenerated set; don't "restore" the old value from an outdated mockup copy.
- **A11y gate is a committed spec** (`e2e/flows/a11y.spec.ts`, runs in the `e2e` project):
  overflow + axe critical/serious at 3 breakpoints. New pages should extend it, not fork it.
- NavTabs scrolls horizontally within itself below ~424px (`overflow-x-auto` + `shrink-0` tabs).
- HomeFeedPage has an `sr-only` h1 "Home Feed" — this is what `smoke.spec.ts`'s heading assertion
  matches (HF-7's placeholder removal had silently broken it; e2e hadn't been run since).
- e2e specs: `page.evaluate` takes a string (no DOM lib in the e2e tsconfig); import the named
  `AxeBuilder`, not the default.

### HF-10b · Full-page visual regression + CI gate
**Status:** `DONE` (2026-07-07) · **Type:** Hardening (Testing) · **Dependency:** HF-7, HF-10a · **Spec:** HF epic § HF-10b ·
**Summary:** `client/docs/HF-10B_VISUAL_REGRESSION_CI_GATE.md`

Diff the real built page against HF-10a's baselines (3 breakpoints × 3 states), required CI check,
token audit for hardcoded hex/px values.

**Deltas for later tickets:**
- **Baselines now capture the REAL page, not the mockup** (user decision; supersedes HF-10a's
  "diff against the mockup baselines"). Mockup fidelity was certified by a one-time human parity
  review; the ongoing gate is self-regression at a tight threshold. Same 9 snapshot names;
  `reference-home-feed.spec.ts` is retired.
- **`?visual-state=empty`** on `/` empties posts+matches via the hook's mock internals (the empty
  state is otherwise unreachable). **FEED-1 must replace this seam with MSW handlers** and keep
  the visual spec's empty state working.
- The visual spec freezes the clock (`page.clock.setFixedTime` BEFORE `goto`) — any future
  timestamp-rendering component must stay deterministic under it.
- **CI exists now** (`client-ci` workflow). Two manual bootstrap steps pending on GitHub: run the
  `update-baselines` dispatch and commit the Linux artifact; mark `client-ci / test` required.
  Until then local baselines are Windows-rendered.
- PR template added (`.github/PULL_REQUEST_TEMPLATE.md`) with the spec-required
  "compared against `design-reference-*.html`" checklist line.

### HF-11 · E2E functional test — Home Feed journey
**Status:** `DONE` (2026-07-07) · **Type:** Testing · **Dependency:** HF-7 · **Spec:** HF epic § HF-11 ·
**Summary:** `client/docs/HF-11_E2E_HOME_FEED_JOURNEY.md`

7-step Playwright journey in the `e2e` project. No MSW needed while everything is mock-driven;
document on the ticket which steps need MSW handlers once Phases 5–6 make hooks hit the network.

**Deltas for later tickets:**
- **Premise corrections (user-approved):** steps 5/6 assert reachability + "click doesn't
  navigate/break" because hashtag/CTA callbacks are deliberate no-ops until FEED-6/FEED-1;
  step 7 asserts the at-cap `aria-disabled` state (mock user has 3 sports — the epic's
  under-cap premise needs SPORT-1's fixtures).
- **MSW upgrade map for this spec** (also in the spec header): step 1 → feed/trending/
  broadcasts/sport-profile handlers (FEED-1/6/7, SPORT-1); step 4 → like mutation (FEED-1);
  step 5 → real hashtag destination (FEED-6); step 7 → under-cap fixture (SPORT-1 + MSW-0).
  These tickets must update `home-feed-journey.spec.ts`, not just their own tests.

### HF-9 · QA / acceptance checklist (Home Feed)
**Status:** `DONE` (2026-07-07) · **Type:** QA · **Dependency:** HF-8, HF-10b, HF-11 · **Spec:** HF epic § HF-9 ·
**Summary:** `client/docs/HF-9_QA_ACCEPTANCE_CHECKLIST.md`

6/7 items pass with evidence; item 7 (E2E green **in CI**) is conditional — CI has never
executed. **The Home Feed epic (HF-00..HF-9) is closed**; the unverified CI run is the epic's
release condition, tracked as HF-12.

### HF-12 · CI bootstrap + first green run — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-08) · **Type:** Infrastructure (ops) · **Dependency:** HF-10b, HF-9 ·
**Summary:** `client/docs/HF-12_CI_BOOTSTRAP.md`

Executed: work pushed, first `client-ci` runs surfaced and fixed a real bug (root `.gitignore`'s
`**/lib` had swallowed `client/src/shared/lib` — CI-only TS2307s), `update-baselines` dispatch →
Linux baselines committed via PR #2 → **fully green run, merged**. HF-9's item 7 is resolved.

**Deltas:**
- **Branch protection is NOT available** (GitHub Free + private repo) — `client-ci` runs on every
  PR/push and reports red/green, but nothing physically blocks merging on red. Hard enforcement
  requires making the repo public or upgrading the plan. Until then: a red check is
  merge-blocking by convention.
- Baselines are now **Linux-rendered**: local Windows `pnpm test:visual` will show diffs — CI is
  the authoritative visual environment (working model in HF-10b's summary).
- Root `.gitignore` has a scoped negation keeping `client/src/shared/lib` tracked — don't
  "clean up" the `!client/src/shared/lib` lines.

### HF-13 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-09) · **Type:** Infrastructure (Testing) · **Dependency:** AUTH-1's `cn()` fix ·
**Summary:** `client/docs/HF-13_REGENERATE_VISUAL_BASELINES.md`

**Found during AUTH-1:** `cn()` (`src/shared/lib/utils.ts`, built on `tailwind-merge`) silently
dropped the custom `border-hairline`/`-t`/`-r`/`-b` utilities whenever combined with any
`border-{color}` class in the same className — `tailwind-merge` didn't recognize the custom name
and bucketed it into the border-color conflict group, so only the color class survived and
`border-width` fell back to the browser default of `0px`. This broke every `Button` `default`/
`outline` variant's border app-wide (silently, since `default`'s background fill still read as a
button visually) — AUTH-1's borderless OAuth buttons were the first place with nothing to mask it.
Fixed in AUTH-1 by registering these utilities under their real `tailwind-merge` conflict groups
(`border-w`/`border-w-t`/`border-w-r`/`border-w-b`) via `extendTailwindMerge`. See AUTH-1's summary
for the full investigation.

**Why this is its own ticket, not folded into AUTH-1:** the fix is global (`cn()` is shared
infrastructure), so it also changes Home Feed's already-shipped rendering — buttons/pills that
were silently missing their border now show it, shifting layout enough that HF-10b's committed
baselines (`e2e/visual/__screenshots__/`) are stale (confirmed: `pnpm test:visual` diff ratios
jumped from the known ~0.01 Windows/Linux noise floor to up to 0.05, with actual image-dimension
changes on some breakpoints). User decision: keep the fix (it's correct, and leaving it half-fixed
would be worse), regenerate baselines as this separate follow-up rather than blocking AUTH-1 on it.

**To execute:** same process as HF-12 — trigger the `client-ci` workflow's `update-baselines`
manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. A human visual check of the new
baselines against `design-reference-home-feed.html` is worth doing at the same time, to confirm
the now-visible borders genuinely match the mockup's intent and this isn't masking a second bug.

### HF-14 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-10) · **Type:** Infrastructure (Testing) · **Dependency:** AUTH-4's TopBar avatar-menu change ·
**Summary:** `client/docs/HF-14_REGENERATE_VISUAL_BASELINES.md`

**Found during AUTH-4:** `TopBar.tsx`'s avatar area changed (chevron + dropdown-menu wiring for the
new logout entry point) — `TopBar` renders on every page, so this shifts Home Feed's already-shipped
rendering the same way AUTH-1's `cn()` fix did (HF-13). Confirmed via `pnpm test:visual`: all 9
committed baselines now legitimately diff (0.02–0.03 pixel-ratio, consistent across repeated runs —
not flakiness), since the top-right corner of every capture now shows the new chevron/avatar-menu
markup. Same reasoning as HF-13 for why this is its own ticket: the change is correct and shouldn't
be reverted, but regenerating baselines is a separate concern from the feature that caused the drift.

**To execute:** identical process to HF-12/HF-13 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
new baselines show the avatar chevron correctly and nothing else drifted unexpectedly.

### HF-15 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-1's real feed + delete menu ·
**Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`

**Found during FEED-1:** Home Feed's `Feed`/`PostCard` are real now (`usePersonalFeed()`), and
`PostCard` gained a new "..." delete menu (owned-post only). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (0.01–0.03 pixel-ratio) — real post content (different author names/text) differs
from the old mock content, and 2 of the 3 e2e fixture posts are owned by the seeded test user, so
the new delete menu icon now appears on them. Direct image inspection of the actual vs. expected
screenshots confirmed this is the correct new rendering, not a regression. Same reasoning as
HF-13/HF-14 for why this is its own ticket: the feature change is correct and shouldn't be
reverted, but regenerating baselines is a separate concern.

**To execute:** identical process to HF-12/HF-13/HF-14 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
3 real posts, their sport badges, and the 2 delete-menu icons all render as expected and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed before overwriting). Human visual
check of the `default`/`empty` @ 1280px captures confirmed the 3 real posts, correct sport badges,
correct like/comment counts, and the 2 delete-menu icons all render exactly as expected — nothing
else drifted. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; local Windows runs diverge on font rendering; CI is the authoritative environment).
Confirmed via direct diff-image inspection that the residual local diff is sub-pixel text
positioning (anti-aliasing), not a content mismatch — same text, same layout, same data in both.
Committed on `feature/feed-1-feed-postcard-real` (not a separate branch) since the baselines and
the code that changed the rendering need to land together — this repo's `master` never had
FEED-1's changes, so there's no "baselines vs. shipped code" mismatch window to avoid, unlike the
HF-13/HF-14 case where the triggering change had already merged.

### HF-16 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-14) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2's comment button + dialog ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

**Found during FEED-2:** `PostCard`'s comment icon changed from a static `<span>` to a clickable
`<button>` (needed for the new comment dialog). Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (~0.01–0.02 pixel-ratio) — a small but real layout nudge from the button's
padding/focus-ring affordances. Direct image inspection of the actual render confirmed correct
content/layout, not a regression. Same reasoning as HF-13/14/15: the feature change is correct and
shouldn't be reverted, but regenerating baselines is a separate concern from the feature that caused
the drift.

**To execute:** identical process to HF-12/13/14/15 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
comment button renders correctly (no dialog-open state leaking into a static capture) and nothing
else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed via byte comparison before
overwriting). **Only 6 of the 9 actually changed** (`default`/`basketball` at all 3 breakpoints) —
the 3 `empty`-state baselines came back byte-identical to what was already committed, which makes
sense: the empty state renders zero posts, so `PostCard`'s comment button never appears in that
capture at all, nothing to shift. Human visual check of the `default`/`basketball` captures at all 3
breakpoints confirmed content, layout, sport badges, and like/comment counts all render exactly as
expected — no visible difference at normal viewing, consistent with the diff being a sub-pixel
padding nudge. `pnpm exec playwright test --project=visual-regression` still shows all 9 as
"different" when run **locally on Windows** — expected per HF-12's own note (baselines are
Linux-rendered; CI is the authoritative visual environment). Confirmed via direct diff-image
inspection of the `empty` state (byte-identical to the prior baseline, so any local diff there is
*purely* Windows-vs-Linux font-rendering noise) that the same characteristic anti-aliasing pattern —
not a content mismatch — accounts for the `default`/`basketball` diffs too.

### HF-17 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-15) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-6's real trending hashtags ·
**Summary:** `client/docs/FEED-6_TRENDINGHASHTAGS_REAL.md`

**Found during FEED-6:** `shared/hooks/useTrendingHashtags.ts` swapped its hardcoded 4-hashtag mock
array for the real `GET /api/hashtags/trending` hook. Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff (0.02–0.03 pixel-ratio, and a genuine image-height reduction — the Trending card
now renders 1 row instead of 4, shortening the page) — MSW's `mockHashtag` fixture is the only
trending row today, replacing the old mock data's `fridayrun`/`tournament`/`pickup`/`tennislife`
set. Direct image inspection of the actual vs. expected screenshots confirmed this is the correct
new rendering (real content, correctly shortened layout, nothing else shifted), not a regression.
Same reasoning as HF-13/14/15/16 for why this is its own ticket: the feature change is correct and
shouldn't be reverted, but regenerating baselines is a separate concern from the feature that
caused the drift.

**Second cause added (same ticket, follow-up UX request before merge):** `PostCard` no longer
renders a separate row of hashtag pill buttons below the content — hashtags are now inline within
the content text itself (`HashtagText`, see the ticket's summary doc). Every post whose content
contains a hashtag (all 3 Home Feed e2e fixtures do) is now one row shorter. Confirmed via the same
`visual-regression` run — no new/different failures, just a slightly larger diff ratio on top of
the trending-card cause above.

**To execute:** identical process to HF-12/13/14/15/16 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
Trending card's single real row renders correctly, hashtags render inline within post content (not
as a separate row), and nothing else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run, `visual-baselines.zip` downloaded and extracted over
`client/e2e/visual/__screenshots__/` (same 9 filenames, confirmed via SHA-256 comparison before
overwriting — all 9 changed). Human visual check of `default`/`basketball`/`empty` at a spread of
breakpoints confirmed: hashtags render inline within post content (no separate row), correct sport
badges/like/comment counts, Trending card's single real `#fridayrun` row, and the empty state all
render exactly as expected — nothing else drifted. `pnpm exec playwright test
--project=visual-regression` still shows all 9 as "different" when run **locally on Windows** —
expected per HF-12's own note (baselines are Linux-rendered; CI is the authoritative visual
environment); diff ratios dropped back to the established ~0.01–0.02 sub-pixel noise floor,
consistent with font-rendering divergence rather than a content mismatch.

### HF-18 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-16) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-7's real group broadcasts ·
**Summary:** `client/docs/FEED-7_GROUPBROADCASTS_REAL.md`

**Found during FEED-7:** `shared/hooks/useGroupBroadcasts.ts` swapped its hardcoded 2-broadcast mock
array for the real `GET /api/posts/broadcast` hook. Confirmed via
`pnpm exec playwright test --project=visual-regression`: all 9 committed Home Feed baselines
legitimately diff further — the Group broadcasts card now renders 1 real row (MSW's single
`mockBroadcastPost`/`mockGroup` fixture pair, "Friday Night Football") instead of the old mock
data's 2 rows ("Riverside Ballers"/"FC Weekend Warriors"), shortening the page further on top of
HF-17's already-executed causes. Confirmed via direct image inspection this is the correct new
rendering (real group name/initials/content, correctly shortened layout, nothing else shifted), not
a regression. Same reasoning as HF-13..HF-17 for why this is its own ticket.

**To execute:** identical process to HF-12..HF-17 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
Group broadcasts card's single real row renders correctly and nothing else drifted unexpectedly.

**Executed:** `update-baselines` dispatch run on `docs/hf-18-regenerate-visual-baselines`,
`visual-baselines.zip` downloaded and extracted over `client/e2e/visual/__screenshots__/` (same 9
filenames, confirmed via SHA-256 comparison before overwriting — all 9 changed, consistent with the
broadcasts card being a global rail element present in every state, same reasoning as HF-17's
Trending-card change touching all 9). Human visual check of `default`/`basketball`/`empty` at
1280px confirmed: the Group broadcasts card's single real "Friday Night Football" row (correct
group name, initials, message text), correct Trending row, correct posts/sport badges, and the
empty state all render exactly as expected — nothing else drifted. `pnpm exec playwright test
--project=visual-regression` still shows all 9 as "different" when run **locally on Windows** —
expected per HF-12's own note (baselines are Linux-rendered; CI is the authoritative visual
environment). Diff ratios (0.01–0.04) are consistent with the established sub-pixel font-rendering
noise floor; one case (`empty-768`) showed an 11px height difference from font-metric line-wrapping
divergence, confirmed via direct image inspection to be identical content/layout, not a mismatch.

### HF-19 · Regenerate visual-regression baselines — follow-up ticket, not in the epic
**Status:** `DONE` (2026-07-22) · **Type:** Infrastructure (Testing) · **Dependency:** GRP-6's
app-wide Dialog position/size/header changes · **Summary:**
`client/docs/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md` (Addendum section)

**Found during GRP-6's addendum:** the shared `Dialog`/`DialogContent` primitive
(`src/shared/ui/dialog.tsx`) changed app-wide — page-anchored positioning, a `fixedHeight` (60vh)
variant, and a new shared `DialogHeader`. `CommentSection` (the `post-modal-*` visual-regression
suite, FEED-11/FEED-12) is one of the two modals that opted into `fixedHeight`, and it renders on
Home Feed, which has a `ModalAnchorProvider`. Confirmed via SHA-256 comparison against the new
`visual-baselines.zip`: exactly the 9 `post-modal-*` baselines changed (all 3 states × 3
breakpoints — the comment dialog now renders at a fixed 60vh instead of shrink-to-fit); the 9
`home-feed-*` baselines (no modal open in those captures) are byte-identical, unaffected — same
"only the causally-connected baselines move" pattern as HF-16 (6-of-9, not all 9).

**To execute:** identical process to HF-12..HF-18 — trigger the `client-ci` workflow's
`update-baselines` manual dispatch on GitHub, download the `visual-baselines` artifact, replace
`client/e2e/visual/__screenshots__/` with its contents, commit. Worth a human visual check that the
comment modal's fixed-height empty space (rather than shrink-to-fit) renders as intended and nothing
else drifted unexpectedly.

**Executed:** `visual-baselines.zip` provided directly (pre-downloaded, not re-triggered this
session), extracted and compared via SHA-256 against the committed set before overwriting: the 9
`post-modal-*` files differed, the 9 `home-feed-*` files were identical. Human visual check of
`post-modal-populated`/`post-modal-empty`/`post-modal-draft` at 375/1280px confirmed the comment
modal now shows a visibly taller box with empty space below its content (fixed 60vh) rather than
shrink-wrapping tightly — correct, matches the intended design, not a rendering bug. Not run through
Playwright locally this round (Windows-vs-Linux font-rendering noise floor already well-established
since HF-12 — the provided artifact is itself the Linux-rendered authoritative baseline, so a local
diff run would add noise, not signal).

### MSW-0 · Mock Service Worker handler setup
**Status:** `DONE` (2026-07-08) · **Type:** Infrastructure (Testing) · **Dependency:** HF-00 · **Spec:** AUTH/FEED epic § MSW-0 ·
**Summary:** `client/docs/MSW-0_MOCK_SERVICE_WORKER_HANDLER_SETUP.md`

Browser-mode MSW wired into a Playwright fixture; handlers for auth/feed/groups typed against the
same `types.ts` as the real hooks; zero real network calls verified via Playwright's network log.
**Delta:** also add sport handlers (`GET /api/sports`, `GET /api/sports/profiles/user/{userId}`)
for SPORT-1, which didn't exist when the epic was written.
**Delta (2026-07-08, resequenced):** the backlog's implementation order lists MSW-0 before AUTH-0,
but its own acceptance criteria requires handlers to be typed against AUTH-0/FEED-0's `types.ts`
files — which don't exist until those tickets ship. User decision: do **AUTH-0 first**, then
MSW-0, despite the `∥` (parallel) marking in the dependency graph. MSW-0 remains `TODO` until
AUTH-0 lands.
**Delta (2026-07-08, scope narrowed):** shipped **auth handlers only**
(`e2e/mocks/handlers/auth.ts`). The same problem that blocked MSW-0 on AUTH-0 recurs for
`feed.ts`/`groups.ts`/sport handlers — they'd need FEED-0/SPORT-1's `types.ts` files, which also
don't exist yet. Applied the same principle rather than re-asking: **FEED-0/FEED-6/FEED-7/SPORT-1
each add their own handler file when they ship** (same pattern as `HF-11`'s MSW upgrade map).
`e2e/mocks/handlers/index.ts` documents this explicitly. The Playwright fixture
(`e2e/mocks/test.ts`) and worker (`e2e/mocks/server.ts`) are feature-agnostic — later tickets only
add a new handlers file and extend `index.ts`'s array, no fixture/wiring changes needed.

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

### AUTH-1 · Login
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-1 ·
**Summary:** `client/docs/AUTH-1_LOGIN.md`

**Deltas for later tickets:**
- **`design-reference-login.html` now exists** (`client/design-reference/`) — created mid-ticket,
  supersedes the epic's plain-text description as the visual spec. Its left-panel two-column card
  layout (`CommunityIllustration` + form) is shared with AUTH-2's Register page per the mockup —
  reuse `CommunityIllustration` and the `shadow-card`/elevated-card token, don't rebuild.
- **OAuth buttons (Facebook/Google/Apple) render disabled**, not omitted — matches the mockup
  visually but non-functional until a real OAuth ticket exists. AUTH-2 should follow the same
  pattern if its mockup includes them.
- **Password show/hide toggle shipped in AUTH-1**, not AUTH-6 as the epic originally assigned —
  the mockup made it core to the form. AUTH-6 no longer needs to add this.
- **New shared primitives:** `src/shared/ui/input.tsx`, `label.tsx` (hand-written, not shadcn
  CLI-generated — the CLI writes to a broken path on Windows and pulls in an inconsistent
  dependency, see AUTH-1's summary), `Button`'s new `primary` variant (solid `border-accent` fill).
  Reuse these rather than re-deriving styles for AUTH-2's form fields/submit button.
- **`cn()` bug fix (`src/shared/lib/utils.ts`):** `border-hairline` utilities are now correctly
  registered with `tailwind-merge` — no longer silently dropped when combined with a
  `border-{color}` class. This changes rendering for every existing `border-hairline` usage
  app-wide (previously invisible borders now show). See **HF-13** (new ticket, `TODO`) for the
  required visual-regression baseline regen this causes.
- **`QueryClientProvider` now wraps the app** (`main.tsx`) — FEED-0 and later tickets needing
  TanStack Query don't need to add this themselves.

### AUTH-2 · Register
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-2 ·
**Summary:** `client/docs/AUTH-2_REGISTER.md`

Register auto-logs-in (same `AuthResult` shape as login) — no artificial "now go log in" step.

**Deltas for later tickets:**
- **No `design-reference-register.html` exists** — user decision (recommended options): Register
  reuses Login's two-column shell verbatim (now extracted as `AuthShell.tsx`,
  `src/features/auth/components/`) plus a disabled OAuth row for visual parity. Any future auth
  page (e.g. forgot-password, if unblocked later) should reuse `AuthShell` too rather than re-
  inlining the shell markup.
- **jsdom does not enforce `minLength` (`tooShort` is hardcoded `false` in jsdom's
  `HTMLInputElement` impl)** — don't write a Vitest/RTL test asserting a `minLength` blocks
  submission, it will pass falsely or fail depending on jsdom internals. Assert the attribute
  instead (`toHaveAttribute('minLength', ...)`) and verify the real constraint manually in a
  browser. `required` is unaffected — jsdom does enforce that one.

### AUTH-3 · Session bootstrap on app load
**Status:** `DONE` (2026-07-09) · **Type:** Feature · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § AUTH-3 ·
**Summary:** `client/docs/AUTH-3_SESSION_BOOTSTRAP.md`

Refresh-on-load restores the session from the httpOnly cookie; the refresh response's `user` object
doubles as "who am I" (no `/api/users/me` exists). **No longer blocked** — auth backlog A2 (BE-1)
shipped 2026-07-08; `POST /api/auth/refresh` genuinely reads/sets the cookie now. See
`modules/auth/docs/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md`.

**Deltas for later tickets:**
- **`App.test.tsx` now always wraps `QueryClientProvider`** (`renderApp` helper used by every case,
  not just `/login`/`/register`) — `App` calls `useSessionBootstrap()` unconditionally, so any test
  rendering `<App />` needs a query client, matching real `main.tsx` structure. Future tests adding
  cases to this file should keep using `renderApp`, not a bare `<MemoryRouter>`.
- **Found and fixed a real backend bug bundled into this branch (user decision — own-branch was the
  alternative, declined):** `JwtTokenServiceImpl.generateToken()` had no random component, so two
  refresh tokens for the same user within the same second collided on `refresh_tokens.token`'s
  `UNIQUE` constraint (500). Fixed with a `jti` claim. See **A4**
  (`modules/auth/docs/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`) — not a client-side concern for AUTH-4/5
  to work around, the fix is already in place.
- **`useSessionBootstrap()` is called once, at the app root (`App.tsx`), regardless of route** —
  AUTH-4's `ProtectedRoute` should read `authStore.isBootstrapping`/`user` rather than re-triggering
  or duplicating this call anywhere else.

### AUTH-4 · ProtectedRoute + logout
**Status:** `DONE` (2026-07-10) · **Type:** Feature · **Dependency:** AUTH-3 · **Spec:** AUTH/FEED epic § AUTH-4 ·
**Summary:** `client/docs/AUTH-4_PROTECTED_ROUTE_LOGOUT.md`

Wait for bootstrap before redirecting; logout clears the session even if the network call fails;
redirect-back after login.

**Delta (2026-07-08):** auth backlog A3 (BE-2) has **shipped** — `POST /api/auth/logout` no
longer takes a `userId` query param at all; it derives the caller from the `Authorization: Bearer`
header (401 if missing/invalid). Implement against `POST /api/auth/logout` with no query string.
See `modules/auth/docs/A3_FIX_LOGOUT_AUTHORIZATION.md`.

**Deltas for later tickets:**
- **Logout entry point is an avatar dropdown menu** (`TopBar`'s `user`/`onLogout` props, new
  `src/shared/ui/dropdown-menu.tsx` primitive) — user decision after reviewing an HTML mockup pitch
  built from real design tokens; not frozen as a `design-reference-*.html`. `TopBar`'s API changed:
  `userInitials`/`onAvatarClick` → `user: { initials, name, email }` + `onLogout`.
  `requiredRole`-mismatch redirects to `/` (no dedicated unauthorized page exists).
- **`e2e/mocks/fixtures.ts` gained `seedAuthenticatedSession(page, targetPath?)`** — the only
  reliable way to reach a route behind `ProtectedRoute` in an E2E spec. AUTH-8/FEED-10 (both build
  new E2E specs touching authenticated routes) should use this rather than re-deriving an
  auth-seeding approach — see AUTH-4's summary for why direct cookie injection and raw-fetch-based
  seeding both failed under real parallel-worker load.
- **HF-14 filed**: Home Feed's 9 committed visual-regression baselines are stale (TopBar's markup
  changed). Any ticket touching `TopBar` again before HF-14 lands should expect the same staleness
  and roll it into the same regen rather than filing a third near-identical ticket.
- **`a11y.spec.ts`, `smoke.spec.ts`, `home-feed-journey.spec.ts`, `app-home-feed.spec.ts`** now import
  `test`/`expect` from `../mocks/test.ts` (MSW-wired) instead of `@playwright/test` directly, and
  seed a session before asserting on Home Feed. Any new E2E spec touching an authenticated route
  should follow the same pattern from the start.
- **Added `PublicOnlyRoute`** (new, `src/shared/components/`, inverse of `ProtectedRoute`) wrapping
  `/login`/`/register` — an already-authenticated visitor is redirected to `/` instead of seeing the
  form again. Not in the original epic; added after review. **If any future route guard needs to
  react to `authStore.user` changing while it stays mounted, decide once via a `useRef` (see
  `PublicOnlyRoute`'s own implementation comment) rather than re-evaluating live on every render** —
  a reactive redirect here raced a just-completed login's own `navigate()` call, both triggered by
  the same `setSession()` update, and which one won was not a safe assumption.

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

### AUTH-6 · Auth hardening
**Status:** `DONE` (2026-07-12) · **Type:** Hardening · **Dependency:** AUTH-1, AUTH-2 · **Spec:** AUTH/FEED epic § AUTH-6 ·
**Summary:** `client/docs/AUTH-6_AUTH_HARDENING.md`

Rate-limit error surfacing (confirm the actual error shape first — unverified), a11y, show/hide
password toggle.

**Delta (scope split, 2026-07-12):** show/hide password toggle already shipped in AUTH-1 (pulled
forward — see AUTH-1's entry above). **Rate-limit error surfacing is out of scope for this ticket**
— verified against the real backend that no rate-limiting exists at all (no filter/interceptor, no
`bucket4j`/`resilience4j`, no config; `AUTHENTICATION_DESIGN.md` documents the intended policy but
`README_AUTH_SETUP.md` explicitly lists it as an unbuilt TODO). There's no error shape to surface
because the backend never returns one. Filed as backend ticket **A5**
(`modules/auth/docs/BACKLOG_MVP.md`) instead of building speculative client code against a made-up
response shape. Once A5 ships, file a new client ticket for the `useLogin`/`useRegister` error
branch — don't fold it back into this one, which is closing out with only its a11y scope. **This
ticket's actual remaining scope is the a11y/axe pass** (keyboard navigation + screen-reader
labeling + a committed axe scan gate on Login/Register, extending `e2e/flows/a11y.spec.ts`'s HF-8
pattern).

**Deltas for later tickets:**
- **`Button`'s `primary` variant now uses a new `--color-accent-solid` token (`#185fa5`), not
  `bg-border-accent`.** The axe gate caught a real WCAG AA contrast failure (white text on
  `border-accent`'s `#378add` = 3.59:1, needs 4.5:1) traced to `design-reference-login.html`'s own
  inline style — the mockup itself has the bug, not just the implementation. Same class of issue as
  HF-8's `text-muted` fix; reference HTML updated to match (`rgb(24, 95, 165)`), don't "restore" the
  original mockup value. Any future page reusing the `primary` button variant inherits the fix
  automatically.
- **`e2e/flows/a11y.spec.ts` now covers `/login`/`/register`** (axe + no-overflow at 3 breakpoints,
  plus explicit Tab-order tests) — future auth-adjacent pages (forgot-password, if unblocked) should
  extend this file too, per HF-8's own precedent, not start a new one.
- **Playwright's `getByLabel()` does substring matching by default** — `getByLabel('Password')`
  collides with the show/hide toggle's `aria-label="Show password"`. Use `{ exact: true }` for any
  future e2e assertion targeting the password field specifically.

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

### AUTH-7 · QA / acceptance checklist (auth)
**Status:** `DONE` (2026-07-13) · **Type:** QA · **Dependency:** AUTH-6, AUTH-8 · **Spec:** AUTH/FEED epic § AUTH-7 ·
**Summary:** `client/docs/AUTH-7_QA_ACCEPTANCE_CHECKLIST.md`

Includes a manual pass against the *real* backend (MSW doesn't substitute) and a BE-1/BE-2
status check. 5/5 items pass.

**Deltas for later tickets:**
- **Item 2's epic wording ("query param, not body") is stale** — re-confirmed live against
  `AuthController.java`: logout is header-derived only, no param of any kind (matches AUTH-4's
  already-documented delta). Nothing new here, just re-verified rather than assumed.
- **"Passes in CI" (item 5) verified via a local `pnpm e2e` run (29/29 green)**, not an actual
  GitHub Actions run — this session had no GitHub access. Flagged as a follow-up for a human to
  spot-check the real `client-ci` run once this ticket's branch is up, same "local ≠ CI" caveat
  HF-12/HF-13 already established for the visual-regression project.
- **Phase 5 (auth integration) is fully closed as of this ticket.** Phase 6 (FEED-0 onward) is next.

### FEED-0 · Types + data hooks scaffold
**Status:** `DONE` (2026-07-13) · **Type:** Foundation · **Dependency:** AUTH-0 · **Spec:** AUTH/FEED epic § FEED-0 ·
**Summary:** `client/docs/FEED-0_TYPES_TANSTACK_QUERY_HOOKS_SCAFFOLD.md`

TanStack Query hooks (`usePersonalFeed`, `useGroupFeed`, `useTrendingHashtags`,
`useActiveBroadcasts`, `useUserGroups`, mutations) with `useInfiniteQuery` paging off Spring's
`Page` shape.

**Decision (2026-07-13): `Post`/`Comment`/`Group`/`GroupMember`/`Hashtag` ids are typed `number`**,
matching the backend's current `Long`/`BIGSERIAL` ids as-is. This was a deliberate, discussed choice
— not an oversight — made while aware that a backend Snowflake-ID migration is now filed
(`modules/social/post-impl/docs/BACKLOG_V1.md` · C11, `modules/social/group-impl/docs/BACKLOG_V1.md`
· A1) and would require flipping these fields to `string` (a real Snowflake value can exceed JS's
`Number.MAX_SAFE_INTEGER`, so the backend side of that migration also adds
`@JsonSerialize(ToStringSerializer)` to emit ids as JSON strings). **When C11/A1 ship, file one
follow-up client ticket** covering the `number` → `string` flip across `types.ts`, `queryKeys.ts`,
MSW fixtures, and every ticket built on this one by then (FEED-1/2/3/4/6/7/8/9) — don't fold it
silently into whichever ticket happens to be active when the backend change lands.

**Deltas for later tickets (all found via live real-backend verification, 2026-07-13 — not assumed
from the epic doc):**
- **`Post.userFullName`/`sportName`/`shareCount` are typed nullable, not the epic's implied
  non-null** — `PostServiceImpl.mapToResponse()` never populates any of the three today (confirmed:
  no builder call for them at all). Filed as backend bug **A9**
  (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — **blocks FEED-1** from rendering a real author
  name/avatar until fixed. FEED-1 must build a fallback (e.g. "Unknown" / initials placeholder) for
  as long as A9 is open, not assume the field is always present.
- **`Post.hashtags`/`Hashtag.tag` do NOT include a leading `#`** — verified against the real
  extraction regex (`#(\w+)`, captures group 1 only). This is real, permanent backend behavior, not a
  bug — differs from HF-0/HF-3/HF-5's mock-data convention (mock hashtags DO include `#`). FEED-1/
  FEED-6 must prepend `#` when bridging real data into those existing mock-convention components,
  or update the components' convention — a decision for whichever ticket lands first.
- **`GET /api/posts/hashtag/{tag}` (this ticket's `usePostsByHashtag`) 500s unconditionally** —
  confirmed via live calls, both `#`-prefixed and not. Root cause: the repository's custom `@Query`'s
  own `ORDER BY` conflicts with the controller's `@PageableDefault` sort, and Spring Data JPA appends
  a second, invalid `ORDER BY` against the wrong entity. Filed as backend bug **A10**
  (`modules/social/post-impl/docs/BACKLOG_MVP.md`) — **blocks FEED-6**'s hashtag click-through
  entirely until fixed. `usePostsByHashtag` is typed/wired correctly (including stripping the leading
  `#` before calling the endpoint, per the point above) but cannot be exercised end-to-end today.
- All other endpoints this ticket calls (`/posts/feed`, `/posts/group/{id}`, `/posts/broadcast`,
  `/hashtags/trending`, `/groups/user/{id}`, like/unlike/delete/create) were verified live and match
  `types.ts` exactly — the `PageResponse<T>` envelope (`content/totalPages/totalElements/number/size/
  first/last/numberOfElements/empty`) matches Spring's real serialization field-for-field.

### FEED-1 · Feed + PostCard (real)
**Status:** `DONE` (2026-07-14) · **Summary:** `client/docs/FEED-1_FEED_POSTCARD_REAL.md`
**Type:** Integration · **Dependency:** FEED-0, HF-3 · **Spec:** AUTH/FEED epic § FEED-1

De-mocks HF-3 against `GET /api/posts/feed`; optimistic like with rollback; delete own posts.
Absorbs post-impl's old F1 ticket ("Frontend — personalized feed").

**Deltas for later tickets:**
- **Temporary `sportId` bridge added:** `src/features/feed/sportIdMap.ts` maps `SportKey` →
  real backend `sportId` (football→5/Soccer, basketball→6, tennis→2), confirmed live against
  `GET /api/sports`. SPORT-1 replaces this file with the real backend-driven mapping — reuse the
  same football↔Soccer naming decision, don't re-litigate it.
- **`e2e/mocks/handlers/feed.ts` is now a small stateful fake backend**, not a fixed responder —
  `postsState` is mutated by the like/unlike/delete/create handlers. Any future ticket adding a
  feed-shaped MSW handler with a mutation should follow this pattern, not a static response, or
  its own optimistic-mutation-then-invalidate cycle will self-clobber the same way this ticket's
  first attempt did.
- **`e2e/mocks/fixtures.ts`'s `mockPost.sportId` was `1` (Badminton) — corrected to `5` (Soccer)**,
  a real bug (there's no "Football" sport in the real backend at all). Any ticket relying on
  `mockPost`'s sport should use the corrected value.
- **HF-15 filed** (visual-regression baselines stale — real content + new delete menu). Any
  ticket touching `PostCard`/`Feed` again before HF-15 lands should expect the same staleness and
  roll it into the same regen, per the HF-13/HF-14 precedent.
- **FEED-8's loading/error UI** now has real `isLoading`/`isError` wired all the way through
  (`useHomeFeedData` → `Feed`) — `Feed` currently renders `null` for both (matching HF-7's own
  precedent), FEED-8 replaces that with the real skeleton/retry UI.

### FEED-2 · CommentSection (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-1 · **Spec:** AUTH/FEED epic § FEED-2 ·
**Summary:** `client/docs/FEED-2_COMMENTSECTION_REAL.md`

De-mocks nothing (no `CommentSection` existed before this ticket) — wires a new modal comment thread
(`GET`/`POST /posts/{postId}/comments`, delete, like/unlike) from `PostCard`'s comment icon. No
`design-reference-*.html` covered this surface, so 3 scope questions were confirmed with the user
before implementation (recorded as deltas below).

**Deltas for later tickets:**
- **Modal dialog (user decision)**, not inline expand — new shared `Dialog` primitive
  (`src/shared/ui/dialog.tsx`, `@radix-ui/react-dialog`) and a new `--color-overlay` token. Any
  future modal (e.g. FEED-5's CreateGroupModal/JoinGroupModal) should reuse this primitive.
- **Reply-to-comment, one level deep, is in scope (user decision)** — the backend already enforces
  "no reply-to-a-reply" server-side and returns each root comment's `replies` fully populated, so no
  generic recursion or extra endpoint was needed.
- **"View more comments" is a plain button (user decision)**, not `Feed`'s
  `useInfiniteScrollSentinel` auto-load pattern.
- **`CommentSection` takes all data as props — no internal data hook, no `postId` prop.**
  `HomeFeedPage` owns `useCommentsData(activeCommentsPostId, isOpen)`, matching every other Home
  Feed component's presentational/controlled convention (this was a mid-implementation correction —
  see the summary doc). Any future ticket extending `CommentSection` should keep it hook-free.
- **`MAX_COMMENT_LENGTH` (1000, matches the backend's real `@Size(max = 1000)`) now lives in
  `feed/types.ts`** — reuse it, don't hardcode `1000` again.
- **Real bug found and fixed in `useDeleteComment`'s optimistic rollback** (two overlapping cache
  snapshots, one silently clobbering the other) — see the summary doc; the fix pattern (one snapshot
  scoped to `feedKeys.all`, since `feedKeys.comments(postId)` nests under it by design) is the
  reference for any future hook needing to roll back more than one cache scope at once.
- **HF-16 filed and now `DONE`** (visual-regression baselines stale — comment `<span>` became a
  `<button>` — regenerated via the `client-ci` `update-baselines` dispatch). Any ticket touching
  `PostCard` again should expect the same staleness and roll a baseline regen into itself, per the
  HF-13/14/15/16 precedent.
- **`design-reference-post-modal.html` added retroactively** (`client/design-reference/`),
  extracted from the shipped implementation rather than pre-implementation (no mockup existed for
  this ticket). Static, interactive (like/reply/delete/add-comment all wired in vanilla JS,
  mirroring the real optimistic behavior) — not yet wired into the `visual-regression` Playwright
  project (no baseline screenshots/spec file exist for it, unlike HF-10a's home-feed baselines).
  **Filed as FEED-11** (`TODO`, below) rather than left as an open question.
- **The reference was then hand-revised by the user and the implementation updated to match** (same
  day) — the dialog header now shows the commented-on post itself (author/time/sport badge, close
  button stacked above the badge) instead of a generic "Comments" title, and the post's own content
  is repeated at the top of the dialog body above the comment list. `CommentSection` gained `post`/
  `sport` props (resolved by `HomeFeedPage` from its loaded feed data) for this. The composer/reply
  "Post" buttons also picked up a muted-gray→solid-blue disabled/enabled color swap (a `className`
  override on `Button`, not a new variant — see FEED-2's summary doc addendum for why, and note for
  FEED-3 if its composer's own `border-accent`-swap button ends up wanting the same pattern a third
  time). `shared/ui/dialog.tsx`'s title-only `DialogHeader` was removed as dead code in favor of
  lower-level `DialogTitle`/`DialogClose` exports, since `CommentSection` now builds a custom header.

### FEED-3 · CreatePostForm (real)
**Status:** `DONE` (2026-07-14) · **Type:** Integration · **Dependency:** FEED-0 (also practically
wants FEED-1 merged first — see delta below) · **Spec:** AUTH/FEED epic § FEED-3 ·
**Summary:** `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`

Maps to `CreatePostRequest`; 5000-char limit enforced client-side; broadcast creation belongs to
FEED-7, not this composer.

**Deltas (2026-07-14, from design review — not yet implemented):**
- **New visual spec:** `client/design-reference/design-reference-home-feed-v2.html` — adds a
  composer card (avatar + auto-growing textarea, placeholder "What's on your mind, {name}?") between
  the SportSwitcher and the feed. Action row: Photo / Location / Tag sport buttons, plus a Post
  button that's disabled until there's text (enabled state: `border-accent` fill, white text).
  Diffed against the original mockup — this composer card is the **only** structural change;
  everything else (nav, switcher, feed cards, rail) is identical.
- **User decision: v2 replaces v1 as the canonical reference.** When this ticket is picked up,
  rename `design-reference-home-feed-v2.html` → `design-reference-home-feed.html` (replacing the
  old file) rather than keeping both — matches HF-10a's "one frozen reference per page" convention.
  This means HF-10b/FEED-1's existing visual-regression baselines need regenerating for the
  composer too, on top of the already-filed **HF-15** (FEED-1's real-content diff) — likely worth
  doing as one combined baseline regen once this ticket's UI lands, not two separate passes.
- **User decision: Photo / Location / Tag sport buttons stay as inert mockup buttons for this
  ticket** — same pattern as HF-3/HF-4's `sendPrompt`-style no-ops for affordances with no
  destination yet, not real pickers. Only the textarea + Post button are functionally wired to
  `useCreatePost()`.
- **Practical sequencing note:** formal dependency is still just FEED-0, but implementation should
  branch off `feature/feed-1-feed-postcard-real` (not `master`) once picked up — that branch has the
  real `Post` type, `usePersonalFeed()` cache, and `optimisticFeedUpdates.ts` helpers this ticket's
  "prepend the new post to the current feed view without a full refetch" acceptance criterion needs
  to hook into. Building against `master`'s still-mock `Feed` would be throwaway work. Rebase onto
  `master` once FEED-1 actually merges.

**Executed (2026-07-14):** by the time this ticket was picked up, FEED-1 and FEED-2 had already
merged into `master` (PRs #28/#29 and #32), so the sequencing note above was moot — branched off
`master` directly, which already had the real `Post` type/`usePersonalFeed()`/
`optimisticFeedUpdates.ts` this ticket needed. `design-reference-home-feed-v2.html` renamed to
canonical `design-reference-home-feed.html` (git mv) as specified; also fixed a stray CDN icon-font
`<link>` the v2 file shipped with back to HF-10a's vendored `./assets/tabler/` path (the file's own
header comment claimed the vendored path but the actual `href` still pointed at jsdelivr — the same
404-risk class of bug HF-10a already fixed once elsewhere). `useCreatePost`'s `onSuccess` now
prepends the real server-returned post directly into the owning feed cache (`personalFeed` or
`groupFeed(groupId)`) instead of a blanket invalidate, satisfying the "without a full refetch"
criterion; `onSettled` still invalidates in the background. Live-verified end-to-end against the
real running backend (registered a test user, Playwright-driven browser walkthrough) — composer
renders, Post button's enabled/disabled states render correctly, posting prepends the real post and
clears the textarea, renders cleanly at 375px. Full details: `client/docs/FEED-3_CREATEPOSTFORM_REAL.md`.

**Deltas for later tickets:**
- **`POST_BUTTON_DISABLED_OVERRIDE` now lives in `shared/ui/button.tsx`** (named export), not
  locally defined in `CommentSection.tsx` — this ticket was the 3rd call site FEED-2's own summary
  anticipated, so it's hoisted now. While hoisting, also consolidated `CommentItem.tsx`'s reply
  button, which had its own unhoisted inline copy of the same classes. Any future "Post"-style
  composer button should import this constant, not redefine the disabled-state classes again.
- **Visual-regression baseline regen (2026-07-15):** the plan was to do this HF-15/16-style
  (committed into the FEED-3 branch before merge), but the PR merged first — same situation as
  HF-13/14 in the end. Regenerated via the `client-ci` `update-baselines` dispatch on a separate
  branch (`docs/feed-3-regenerate-visual-baselines`) after merge. All 9 baselines changed
  byte-for-byte this time (unlike HF-16's 6-of-9) — the composer renders on every state including
  `empty`, unlike HF-16's comment button which only appeared on rendered posts. Human-verified
  `default`/`empty`/`basketball` at all 3 breakpoints: composer placeholder/action row/Post button,
  correct sport badges, correct like/comment counts, nothing else drifted.
  `pnpm exec playwright test --project=visual-regression` still reports all 9 as "different" locally
  on Windows — expected per HF-12's note (CI is the authoritative Linux-rendered environment);
  confirmed via diff-image inspection the local diff is pure sub-pixel font-rendering ghosting
  (same layout/content/structure), not a content mismatch.
- **`useCreatePost`'s cache-targeting logic (personalFeed vs. groupFeed by `post.groupId`) is a
  known gap for `GROUP_BROADCAST` posts** — they land in `groupFeed(groupId)` but not
  `feedKeys.broadcasts()`. FEED-7 (broadcast creation) needs to either extend
  `useCreatePost`'s onSuccess or add its own targeted cache write when it ships.

### FEED-4 · Group switching (real)
**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0 · **Spec:** AUTH/FEED
epic § FEED-4 · **Summary:** `client/docs/FEED-4_GROUP_SWITCHING_REAL.md`

`useUserGroups(currentUser.id)`; selected space is UI state in Zustand, not in TanStack Query.

**Delta (2026-07-15, UI shape — user decision, not in the epic):** the switcher is a new **Groups
page** (`/groups`, replacing the `ComingSoonPage` stub), not an inline control on Home Feed. A group
is 1:1 with a sport (`Group.sportId`), so filtering the switcher by the shared `activeSport` (now
promoted to a new `feedSpaceStore.ts` Zustand store, inherited/switchable from both Home Feed and
Groups) bounds it to a handful of pills instead of an unbounded list. Sport switch always resets the
group selection to "All". Zero joined groups for the active sport → "Join Group"/"Create Group"
render as two buttons; one or more → both collapse into a right-aligned "..." menu instead. No post
composer on "All". `Feed`/`PostCard`/`CreatePostForm`/`CommentSection`/`CommentItem` promoted from
`features/home-feed/components/` to `shared/components/` so the Groups page can reuse them —
**FEED-5/6/7 and any future page needing these should import from `shared/components/`, not
`features/home-feed/`.**

**Deltas for later tickets:**
- FEED-5 wires `GroupSpaceSwitcher`'s `onCreateGroup`/`onJoinGroup` (currently no-ops on both the
  button and the "..." menu-item code paths).
- No E2E or visual-regression coverage exists yet for the Groups page (deliberately out of scope —
  FEED-10 covers the feed/groups E2E journey; visual-regression for the new page is its own future
  ticket, same pattern as FEED-11 for the comment modal).
- `useGroupsPageData`'s "All" posts are a client-side filter of `usePersonalFeed()`'s already-blended
  `GROUP_POST`s (no aggregate "all my groups" backend endpoint exists) — swap this if one ever ships.

### FEED-5 · CreateGroupModal + JoinGroupModal (real)
**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-4 · **Spec:** AUTH/FEED
epic § FEED-5 · **Summary:** `client/docs/FEED-5_GROUP_CREATE_JOIN_MODALS.md`

Joining is by group **name**, not id (`CreateJoinRequestRequest` has no `groupId` field) —
`JoinGroupModal` searches `GET /api/groups/public` rather than taking a raw name.

**Delta (2026-07-15, mid-ticket scope addition — user decision):** the Groups page's right rail
(UpcomingMatches → TrendingHashtags → GroupBroadcasts) now matches Home Feed's exactly.
`GroupSpaceSwitcher`'s zero-groups buttons restyled to match `SportSwitcher`'s dashed "Add sport"
pill (search/plus icons); the same icons were added to the "..." dropdown's menu items too.

**Delta for FEED-6/FEED-7:** the rail hooks you're de-mocking now live in `shared/hooks/`
(`useTrendingHashtags.ts`, `useGroupBroadcasts.ts`), not `home-feed/` — `home-feed/mockData.ts` was
deleted (everything in it had moved out, across FEED-4 and this ticket). Swap the internals of these
shared hooks; neither Home Feed nor the Groups page needs to change as a consumer.

**Bug fix (2026-07-15, found post-ship, not a ticket):** `useGroupsPageData.ts`'s `createPost`
(built here in FEED-4, unchanged by FEED-5) never sent `postType`, so every group post 400'd against
the real backend (`PostServiceImpl.createPost` defaults an omitted `postType` to `USER_FEED`, which
then can't carry a `groupId`) — see `PROGRESS.md`'s 2026-07-15 entry for the full writeup. Fixed to
send `postType: 'GROUP_POST'` explicitly; `e2e/mocks/handlers/feed.ts`'s `POST /api/posts` handler
also tightened to enforce the same rule so MSW can't mask this bug class again. **FEED-7 note:**
GROUP_BROADCAST creation (below) must do the same — send `postType: 'GROUP_BROADCAST'` explicitly,
never rely on the backend inferring it.

### FEED-6 · TrendingHashtags (real)
**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0, HF-5 · **Spec:** AUTH/FEED epic § FEED-6 ·
**Summary:** `client/docs/FEED-6_TRENDINGHASHTAGS_REAL.md`

Pure data-source swap behind HF-5's component; hashtag click routes to `usePostsByHashtag(tag)`.

**Delta (2026-07-15, click-through destination — user decision, no epic/mockup coverage):**
hashtag results render in a **modal** (`HashtagPostsModal`, new shared component, same
`shared/ui/dialog.tsx` pattern FEED-2 used for comments), not a route — no `/hashtag/:tag` page
exists. Fully interactive (real like/unlike/delete/comment via `useHashtagResultsData`, reusing
`Feed` directly). Opening comments from inside the hashtag modal closes it first, then opens
`CommentSection` (not stacked dialogs).

**Deltas for later tickets:**
- **HF-17 filed** (visual-regression baselines stale — Trending card now renders 1 real row
  instead of the old mock's 4, shortening the page). Any ticket touching `TrendingHashtags`'/the
  Home Feed rail's rendered content again before HF-17 lands should expect the same staleness.
- **`activeCommentsPost`'s lookup (HomeFeedPage/GroupsPage) now also falls back to the
  hashtag-results cache** — a post opened from `HashtagPostsModal` may not be in the main feed's
  already-loaded pages. Doesn't solve the general "any post, any source" case — that's **FEED-12**.
- No visual-regression coverage exists for `HashtagPostsModal` itself yet — same "own future
  ticket" precedent as FEED-11 (comment modal).

### FEED-7 · GroupBroadcasts (real)
**Status:** `DONE` (2026-07-16) · **Type:** Integration · **Dependency:** FEED-0, HF-6 · **Spec:** AUTH/FEED epic § FEED-7 ·
**Summary:** `client/docs/FEED-7_GROUPBROADCASTS_REAL.md`

De-mocks HF-6 via `useActiveBroadcasts()`; adds owner/admin-only "create broadcast" action
(`postType: GROUP_BROADCAST`, server defaults expiry to +24h). The backend also has
`PUT /groups/join-requests/{id}/accept|decline` (owner/admin) available if a future ticket wants
to build the reviewer-side UI — not needed by FEED-5's requester-side scope.

**Deltas (all user decisions, no design-reference-*.html covered this surface):**
- **"Create broadcast" is a switcher inside `CreatePostForm`**, next to Tag sport — not a separate
  button/modal. Visible only when `canBroadcast` (the selected group's `currentUserRole` is
  `group_owner`/`group_admin` — already on the `Group` object from `useUserGroups`, no new
  permission-check call needed). Defaults off; resets to off on every submit, same as the
  composer's `content`.
- **The backend caps each group at one active broadcast** (`existsActiveGroupBroadcast`, 400 on a
  second attempt). Rather than hide/disable the switcher, submitting with it on while the group
  already has one active opens `UpdateBroadcastConfirmDialog` (new component) showing the existing
  message; confirming calls a new `useUpdatePost()` (`PUT /api/posts/{postId}`) against the
  existing broadcast instead of creating a second one.
- **`PostCard`'s comment button renders disabled for a `GROUP_BROADCAST` post**, "for now" — like
  stays fully functional. Applies everywhere `PostCard` renders (only a group's own feed actually
  surfaces broadcasts inline — `findByGroupIdAndIsActiveTrue` has no postType filter — the personal
  feed's `GROUP_POST`-only filter excludes them).
- **The right rail's broadcast rows stay unwired** (`onBroadcastClick` still a no-op) — the real
  interaction point is the broadcast post itself inside its group's feed.
- **`GroupBroadcast.id`/`.groupId` changed from `string` to `number`** to match the real `Post`
  they're built from (same class of fix FEED-1/SPORT-1 made for their own mock→real transitions).

**Found during live verification (not a FEED-7 bug — a pre-existing, already-documented gap):**
composer-created posts never get a `sportId` (FEED-3's "Tag sport" is inert everywhere), so `Feed`'s
own sport filter hides them under any pill except "All". Only reachable in practice by selecting a
specific group whose sport pill isn't "All" — worked around in verification by choosing the group's
sport inside `CreateGroupModal` instead of pre-selecting a sport pill (which would have reset
`selectedGroupId` back to null anyway, per `feedSpaceStore`'s own coupling). Not fixed here — it's
FEED-3's documented scope, not new.

**HF-18 filed** (visual-regression baselines stale — the broadcast card now renders 1 real row
instead of the old mock's 2). Same HF-13..HF-17 pattern.

### SPORT-1 · Sport switcher (real) — new ticket, not in either epic
**Status:** `DONE` (2026-07-15) · **Type:** Integration · **Dependency:** FEED-0 (hook conventions), HF-2, AUTH phase ·
**Summary:** `client/docs/SPORT-1_SPORT_SWITCHER_REAL.md`

De-mocks HF-2 now that `SportController` exists (shipped after the epics were written — see
Reality check). Full spec lives here since no epic covers it:

**Endpoints (verified in `modules/sport/sport-impl`):**
- `GET /api/sports/profiles/user/{userId}` — the caller's sport profiles (public GET)
- `GET /api/sports` — active sport catalog (public), for icon/name lookup and the future add-sport flow

**Deliverables:**
- `useSportProfiles()` hook (TanStack Query) replacing the mock sport-profile array behind the
  same `{ data, isLoading, isError }` shape — components untouched, per the data-layer convention.
- Mapping layer `UserSportProfileResponse` → `SportProfile { key, label, icon, colorRamp }`:
  `colorRamp` and icon come from a **static client-side config object** keyed by sport (this exact
  approach was already decided in sport-impl's A3 ticket for sport attributes — reuse it, don't
  invent a backend-driven mapping). Follow `client/CLAUDE.md`'s ramp assignment rules
  (football→teal, basketball→coral, tennis→purple; next: pink, then gray; never blue/green/amber/red).
- MSW handlers for both endpoints (added under MSW-0's structure).
- "Add sport" stays a callback-only entry point in this MVP (the add-sport flow is its own future
  screen), but note `POST /api/sports/profiles` already exists for when that screen is scoped.

**Delta (2026-07-15, scope addition):** the "Add sport" bullet above was superseded mid-ticket —
requested for real, not left a no-op, since `POST /api/sports/profiles` already existed and had
no other ticket scoped to consume it. Built `AddSportModal` (sport + skill level, required; years of
experience, optional — preferred position/bio deferred to a future profile-editing screen) and
`useAddSportProfile()`, wired into both HomeFeedPage and GroupsPage. See the summary doc for detail.

**Acceptance criteria:**
- SportSwitcher renders the real profiles for the logged-in user; a user with 3 profiles sees no
  "Add sport" pill (backend enforces the same cap of 3 active profiles).
- A user with zero sport profiles doesn't break the page — "All" plus "Add sport" renders, feed
  filter still works.
- Sport keys used for feed filtering stay consistent with the `sportId`/`sportName` the posts API
  returns, so HF-3's filter keeps working after both are de-mocked.

**Delta (2026-07-15):** the first bullet above says a user at the cap "sees no 'Add sport' pill" —
superseded by HF-2's own already-approved delta (`aria-disabled` + no-op at the cap, always rendered,
mockup parity). Implemented against HF-2's actual behavior, not this ticket's literal wording, same
resolution as HF-2's delta note itself. Also found and fixed a latent bug in `UpcomingMatches.tsx`
(unconditional `sportsByKey[match.sport]` lookup, safe only under the old always-3-sport mock) —
see the summary doc for detail; directly required by the second acceptance bullet above.

### FEED-8 · Integration hardening
**Status:** `DONE` (2026-07-16) · **Type:** Hardening · **Dependency:** FEED-1..FEED-7, SPORT-1 · **Spec:** AUTH/FEED epic § FEED-8 ·
**Summary:** `client/docs/FEED-8_INTEGRATION_HARDENING.md`

Skeletons while loading, retry affordance on error (failed fetch ≠ empty feed), empty states match
the mock versions'.

**Deltas for later tickets:**
- **Scope, as user-approved:** all real-data surfaces on both pages (`Feed`/`TrendingHashtags`/
  `GroupBroadcasts` on Home Feed + Groups, plus Groups-only `GroupSpaceSwitcher`). `UpcomingMatches`
  stays out (still mock-only). `SportSwitcher`/sport-profiles loading was **not** in scope — has the
  same latent "loading looks like empty" gap `GroupSpaceSwitcher` had, left unfixed, flagged for a
  future ticket if it's ever noticed. `CommentSection`'s error state still has no retry button
  (FEED-2's plain-text version) — also left as-is.
- **"Pagination edge" resolved as**: a failed "load more" (via TanStack Query v5's
  `isFetchNextPageError`, distinct from the initial-load `isError`) keeps already-loaded posts
  visible and only swaps the load-more control for its own retry affordance.
- **MSW error-simulation plumbing added now, not deferred**: `e2e/mocks/apiErrors.ts` +
  `fixtures.ts`'s `simulateFeedErrorOnNextLoad`/`simulateTrendingErrorOnNextLoad`/
  `simulateBroadcastsErrorOnNextLoad`/`simulateGroupsErrorOnNextLoad` — **FEED-10 should reuse these**
  for its "at least one MSW-simulated error response" acceptance criterion rather than re-deriving the
  same runtime-override plumbing.
- New shared `src/shared/ui/skeleton.tsx` primitive — reuse for any future loading-state UI rather
  than hand-rolling `animate-pulse` divs per component.

### FEED-10 · E2E functional test — feed/groups journey
**Status:** `DONE` (2026-07-16) · **Type:** Testing · **Dependency:** MSW-0, FEED-8 · **Spec:** AUTH/FEED epic § FEED-10 ·
**Summary:** `client/docs/FEED-10_E2E_FEED_GROUPS_JOURNEY.md`

**Delta:** add a step for SPORT-1 — switching to a real sport profile filters the feed, and the
zero-profiles fixture renders without error.

**Deltas for later tickets:**
- **Error-simulation target changed from FEED-8's own delta note (user decision):** wired up
  `CreatePostForm`'s previously-missing `isError` UI and simulated a failed post creation (the epic's
  literal example), rather than reusing FEED-8's `apiErrors.ts` overrides — those prove a different
  surface's error state, not create-post's, and `CreatePostForm` had no error UI at all until this
  ticket. `apiErrors.ts`'s overrides remain unused by any spec so far; still available if a future
  ticket wants to cover Feed/Trending/Broadcasts/Groups load-failure specifically.
- **`mockBroadcastPost.broadcastEndTime` fixed** — was hardcoded and had drifted into the past;
  now computed via `hoursFromNow(24)`. **Any future ticket adding a broadcast fixture must use
  `hoursFromNow`/`hoursAgo`, never a hardcoded date** — this exact bug will recur otherwise.
- **`GET /posts/feed`'s MSW handler is now genuinely page-aware** (`pagedFeedResponse` in
  `handlers/feed.ts`) — any future spec needing more than 20 personal-feed posts should use
  `feed.ts`'s exported `seedPostsState(posts)` rather than adding another parallel override.
- **`mockOwnedGroup` fixture added** (`group_owner`, sportId 2/Tennis) — reuse this for any future
  spec needing an owner/admin-role group, rather than adding a third one.
- FEED-9's checklist can now check off "FEED-10's E2E suite passes."

### FEED-9 · QA / acceptance checklist (integration)
**Status:** `DONE` (2026-07-17) · **Type:** QA · **Dependency:** FEED-10 · **Spec:** AUTH/FEED epic § FEED-9 ·
**Summary:** `client/docs/FEED-9_QA_ACCEPTANCE_CHECKLIST.md`

**Delta:** add a checklist line — HF-2's mock swapped for SPORT-1's real hook with no visible UI
regression (same bar as HF-3/HF-5/HF-6).

All 5 items pass (manual pass against a real running backend, not MSW — real test accounts/group,
21 seeded posts to force a genuine second feed page). Found and fixed a trivial real bug along the
way (`GroupsPage.tsx`'s `CreateGroupModal`/`AddSportModal` both keyed from a counter starting at `0`
— React duplicate-key warning, functionally harmless, fixed). Found and filed a real backend bug, not
fixed here: broadcast-expiry checks compare against the wrong clock (JVM-local vs. DB-UTC) — filed as
**A11** in `modules/social/post-impl/docs/BACKLOG_MVP.md`, `TODO`. Latent only — the real
create-broadcast flow's `+24h` default margin fully masks it today; would bite a future short-duration
broadcast feature. Item 4 ("passes in CI") verified via a local `pnpm e2e` run (31/31) only, same
"local ≠ CI" caveat AUTH-7/HF-12 already established — no GitHub access this session.

**Deltas for later tickets:**
- **`A11` (backend, `TODO`):** don't build a "custom broadcast duration" feature or expose
  `updateBroadcastEndTime` to a real endpoint/client call until this timezone fix lands — it would hit
  the bug directly instead of being masked by the `+24h` default margin.
- **`DialogOverlay` (`src/shared/ui/dialog.tsx`) ref-forwarding console warning** — flagged, not
  fixed (out of this ticket's checklist scope, pre-existing since FEED-2, no functional impact). Worth
  a small follow-up ticket if a future dialog change touches this file anyway.

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

### FEED-12 · Comment modal fetches its own post + URL-addressable deep link — new ticket, not in either epic
**Status:** `DONE` (2026-07-17) · **Summary:** `client/docs/FEED-12_COMMENT_MODAL_DEEP_LINK.md` ·
**Type:** Feature · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised by the user right after FEED-2 merged (PR #32) — today `CommentSection`'s `post`/
`sport` props are resolved by `HomeFeedPage` purely by looking up `data.posts.find(post => post.id
=== activeCommentsPostId)` against `usePersonalFeed()`'s already-loaded cache
(`HomeFeedPage.tsx`). Two real consequences of that:

1. **The modal can only ever open for a post the feed has already fetched.** A post outside the
   currently loaded pages (e.g., paginated further than the user has scrolled, or from a different
   feed view entirely) has no path to a comment dialog today.
2. **There is no URL that opens directly to a post's comment thread.** No route reads a `postId`
   from the URL at all — the dialog is 100% driven by in-memory page state
   (`activeCommentsPostId`), so a shared link, a notification deep link, or a page refresh while the
   dialog is open all have nowhere to go.

**What changes:**
1. A new `usePost(postId)` hook (TanStack Query) wrapping `GET /api/posts/{postId}` (confirmed to
   exist — `PostController.getPost()`, returns the same `PostResponse` shape `usePersonalFeed`
   already types against, no new client type needed). Query key should be independent of the feed
   (e.g. `feedKeys.post(postId)`) but consider seeding it via `initialData` from the feed cache when
   the post is already known there, so opening the dialog from within an already-loaded feed doesn't
   trigger a redundant network round-trip — only the "not in cache" / direct-URL path should
   actually hit the network.
2. `CommentSection`'s `post`/`sport` props come from this dedicated fetch instead of
   `HomeFeedPage`'s feed-cache lookup — this decouples the modal entirely from feed pagination
   state, and is what actually makes it work from a cold direct-URL load.
3. A URL route — recommend path-based (`/posts/:postId`), matching this app's existing route style
   (`App.tsx`'s flat `<Route path="/...">` list) over a query param, since a query-param convention
   was already deliberately retired once (`?visual-state=empty`, removed per HF-10b's own delta once
   a real seam existed). **Exactly what renders at that route is a real design decision, not
   assumed here** — same kind of question FEED-2's modal-vs-inline was, worth confirming with the
   user at pickup rather than guessing: does `/posts/:id` render the full `HomeFeedPage` underneath
   with the dialog pre-opened (simplest, reuses everything), or a lighter dedicated single-post
   shell? The former is almost certainly right unless there's a reason to avoid loading/rendering
   the whole feed just to view one post's comments.
4. Close behavior when opened via direct URL needs to be sane — e.g. navigate back to `/` on close
   rather than leaving a bare page behind the dialog. Decide whether browser back/forward should
   also close it (likely yes, for free, if using a real route rather than a state flag).
5. New MSW handler: `GET /api/posts/:postId` doesn't exist in `e2e/mocks/handlers/feed.ts` yet
   (only list/feed endpoints and `DELETE /api/posts/:postId` exist today) — add it, reusing
   `postsState`.

**Filed (2026-07-17):** whether an anonymous (logged-out) visitor should be able to view a shared
`/posts/:postId` link **without** logging in at all is a real product question this ticket doesn't
answer — MVP behavior is the same `ProtectedRoute` redirect-then-bounce-back every other deep link
already gets (AUTH-8 step 7), which is correct and sufficient for this ticket. Filed as **ANON-1** in
the new `client/docs/BACKLOG_V1.md` for a future decision + scoping pass, not built here.

**Sequencing note:** this simplifies **FEED-11** (below) — once the modal is reachable by URL,
FEED-11's visual-regression spec can `page.goto('/posts/123')` directly instead of navigating to `/`
and clicking through a real post card to open the dialog. Recommended to pick this up before FEED-11,
though not a hard blocker if FEED-11 lands first (its spec would just need a follow-up simplification
pass afterward).

**Acceptance criteria:**
- Loading `/posts/{id}` as a fresh page load (no prior feed fetch, e.g. a new tab) renders the
  correct post + comment thread, including for a post that would not be present in the feed's first
  loaded page.
- Opening the dialog via the existing in-feed click-to-open flow still works, with no regression and
  no unnecessary duplicate fetch when the post is already in the feed's cache.
- Closing the dialog when it was opened via direct URL returns to a sane page state (not a bare
  backdrop with nothing behind it).
- `usePost`/MSW handler covered by Vitest, same pattern as `useComments`'s own test file.

**Delta (2026-07-17, executed):** the plan's "does `/posts/:id` render the full HomeFeedPage underneath
with the dialog pre-opened, or a lighter dedicated single-post shell?" open question resolved to the
former (Option A), with a caveat confirmed at pickup: on a cold direct-URL load, the page behind the
dialog is the viewer's own generic Home Feed, not anything contextual to the shared post — accepted
since the modal has focus regardless. **New scoping decision, not in the original ticket text:**
Groups page (which also opens `CommentSection`) stays local-state-only, no `/posts/:postId` routing —
only Home Feed's comment dialog is URL-addressable, since routing Groups' opens through that URL would
unmount Groups' own selected-group state on close. **Filed ANON-1** in a new `client/docs/BACKLOG_V1.md`
for the "should a shared link be viewable while logged out" question — MVP behavior is the existing
generic `ProtectedRoute` redirect-then-bounce-back, not a new mechanism. Live-backend verification
found and fixed a real bug outside the original plan: neither `usePost` nor the pre-existing
`useComments` skipped TanStack Query's default retry on a 404, so a bad link took ~7s to show its error
state — both fixed. Full write-up: `client/docs/FEED-12_COMMENT_MODAL_DEEP_LINK.md`.

### FEED-11 · Visual regression harness for the post comment modal — new ticket, not in either epic
**Status:** `DONE` (2026-07-18) · **Type:** Infrastructure (Testing) · **Dependency:** FEED-2 (`DONE`) ·
**Origin:** raised during FEED-2's implementation — the modal has no visual-regression coverage
today, unlike Home Feed (HF-10a/b) or the auth pages (their own `a11y.spec.ts`/visual specs).

**Why this is its own ticket, not folded into FEED-2:** the comment dialog already has a
`design-reference-post-modal.html` reference and full Storybook + Vitest coverage — this ticket is
specifically about the missing Playwright `visual-regression` project coverage (pixel-diffing the
real rendered page against frozen baselines), the same layer HF-10a/b added for Home Feed. Deferred
at FEED-2 time because it's a genuine scoping decision (see below), not a quick add.

**What makes this different from HF-10a/b's harness (read before starting):**
- Home Feed's baselines are captured by `page.goto('/')` plus a query param for the empty state —
  a URL is enough. The comment modal is **not reachable by URL today** — a spec has to
  `page.goto('/')`, find a real post card, click its "View comments" button, and wait for the
  dialog's open transition to settle before screenshotting. **Check FEED-12's status before
  starting this**: if FEED-12 (above) has shipped by then, just `page.goto('/posts/{id}')` directly
  instead — simpler and removes the click-through step entirely. If FEED-12 hasn't landed yet, fall
  back to the click-through approach described here rather than blocking on it. Decide whether to
  screenshot the whole page (dialog + dimmed backdrop, matching how a user actually sees it) or just
  the dialog element (`page.locator('[role="dialog"]')`) — the former matches
  `design-reference-post-modal.html`'s own framing, the latter is cheaper to maintain if the backdrop
  content (feed posts) is expected to drift independently.
- **Meaningful states to cover** (mirroring HF-10a's "3 breakpoints × 3 states" shape): empty
  thread, populated (root comments + at least one reply, to catch indentation drift), and the
  disabled→enabled Post button treatment (FEED-2's addendum) — arguably 2 button-state captures at
  one breakpoint rather than duplicated across all 3, to keep the baseline count sane. Loading/error
  states are intentionally NOT frozen here, same precedent as Feed's own visual spec (HF-10b) never
  capturing `isLoading`/`isError` — those are Storybook's job.
- **MSW dependency:** unlike Home Feed's visual spec (which currently drives mock-internal state via
  `usePersonalFeed`'s real query against MSW handlers already wired for `e2e`), this needs the
  `feedHandlers`' `commentsState` (FEED-2) to already have deterministic fixture data seeded for
  whichever post the spec opens — reuse `mockPost`/`mockComment` from `e2e/mocks/fixtures.ts`, don't
  invent a second fixture set.
- **Freezing time still applies** — reuse the same `page.clock.setFixedTime()` pattern HF-10b
  established for Home Feed's relative timestamps, since `CommentItem` also renders
  `formatRelativeTime()`.

**Acceptance criteria (once picked up):**
- New baselines committed under `e2e/visual/__screenshots__/` (naming convention:
  `post-modal-<state>-<width>.png`, matching Home Feed's `home-feed-<state>-<width>.png` pattern).
- Baselines generated via the same `client-ci` `update-baselines` dispatch as Home Feed's (Linux-
  rendered, per HF-12's precedent) — not committed from a local Windows run.
- Wired into the existing `visual-regression` Playwright project (`playwright.config.ts`) — no new
  project/config needed, same as `app-home-feed.spec.ts`.
- A token-hardcoding audit pass over `CommentSection.tsx`/`CommentItem.tsx`/`shared/ui/dialog.tsx`,
  matching HF-10b's own "diff against tokens, not just pixels" scope.

**Executed (2026-07-18):** harness built — `e2e/visual/app-post-modal.spec.ts`, dialog-element-only
screenshots (user decision — cheaper than full-page, backdrop already covered by Home Feed's own
spec), 9 baselines (`empty`/`populated`/`draft` × 3 breakpoints, same shape as Home Feed). `populated`
adds a reply live through the real "Reply" UI onto `mockComment` (no new fixture); `draft` types text
into the composer without submitting, to capture the Post button's enabled treatment. Token audit
found nothing to fix. All 9 states ran mechanically correctly and were directly inspected (Playwright
wrote "actual" images since no baseline exists yet) — confirmed correct rendering in every case. See
`client/docs/FEED-11_POST_MODAL_VISUAL_REGRESSION.md` for the full writeup, including a non-obvious
finding about MSW-1's standalone mock server not sharing the page's frozen clock (turned out not to
matter — `formatRelativeTime`'s `minutes < 1` branch also catches negative diffs, so a live-created
reply still renders deterministic "just now" text regardless of the real run date).
**Baselines landed (2026-07-18):** `update-baselines` dispatch run, all 9 `post-modal-*.png` extracted
into `e2e/visual/__screenshots__/` and committed. Human visual check of `populated`/`draft`/`empty`
at 1280px confirmed: nested reply indents correctly under its root comment, both timestamped "just
now"; composer's Post button shows the correct enabled/disabled treatment in each state; empty-state
message renders correctly. `pnpm exec playwright test --project=visual-regression app-post-modal.spec.ts`
locally on Windows shows all 9 at ~0.02–0.03 pixel-ratio diffs — consistent with the established
Windows/Linux font-rendering noise floor documented since HF-12, not a content mismatch.

### GRP-1 · Group page restructure — cover banner, Posts/Chat/Settings tabs, inline discovery panel
**Status:** `DONE` (2026-07-20) · **Summary:** `client/docs/GRP-1_GROUP_PAGE_RESTRUCTURE.md` ·
**Type:** Feature · **Dependency:** FEED-4, FEED-5 (`DONE`) ·
**Design reference:** `client/design-reference/design-reference-group-feed.html` — `#groups-view`
section (already reflects the target design; no update needed before starting, unlike a from-scratch
page)

**Origin:** flagged in this file's own deferred-items table (below) — "Group invitations / pinned
posts / ownership transfer UI — belong to a future Groups-page epic." This is that epic's first
ticket.

**Delta (2026-07-20, executed):** `GroupDiscoveryPanel`'s group-card grid (below the Join/Create
buttons, matching the design reference) was briefly dropped mid-implementation after
`App.test.tsx`'s pre-existing FEED-4 integration test caught it duplicating `GroupSpaceSwitcher`'s
pill row exactly (same accessible name, `getByRole` found two ambiguous "Downtown Strikers"
buttons) — then **restored** per explicit correction, since the reference genuinely shows both
controls. Fixed properly instead: each card's accessible name is `Open {groupName}`, distinct from
the switcher pill's bare name. `App.test.tsx` updated to target the specific control each assertion
means to test. Full writeup: `client/docs/GRP-1_GROUP_PAGE_RESTRUCTURE.md`. Also note for **GRP-2**:
no visual-regression harness exists yet for `#groups-view` (unlike Home Feed's HF-10a/b) — out of
scope here, flagged as a follow-up, not silently dropped.

**Decisions (resolved 2026-07-20, at pickup):**
1. **Chat tab: build the reference's interactive UI now**, local state only (matches the reference
   exactly — message bubbles, input, Send). No persistence, since no chat backend exists — show a
   small disclaimer that messages aren't saved. Real chat is a separate future ticket once a
   conversations/messages backend is scoped.
2. **Settings tab is gated, not hidden:**
   - **Member:** can open Settings, **read-only** (all fields displayed, no inputs enabled).
   - **Owner + Admin:** can edit group properties (Privacy toggle) — matches the real
     `PUT /api/groups/{groupId}` owner/admin rule.
   - **Owner only:** a **Delete Group** button, placed at the very bottom of the Settings tab
     content, below everything else (danger-styled, separate from Leave Group). Matches the real
     `DELETE /api/groups/{groupId}` owner-only rule — not in the original design reference, added
     per this decision.
   - Leave Group stays available to any member (owner must transfer ownership first — existing
     backend rule, surface that constraint in the UI if the owner tries to leave).
3. **Notifications toggle: dropped from this ticket.** No backend field exists for a per-user group
   notification preference — not scoped here.
4. **New ticket filed for the settings data gap**: the four `GroupSettings` toggle fields
   (`allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/`maxMembers`) are real but split
   across a second endpoint (`PUT /api/groups/{groupId}/settings`, owner-only) from the properties
   endpoint the Privacy toggle uses. Rather than wire both endpoints into one tab without confirming
   the contract first, filed **B7** (`modules/social/group-impl/docs/BACKLOG_MVP.md`) to audit/
   confirm the full settings data set and permission enforcement, and **GRP-2** (below, `TODO`,
   blocked on B7) to adapt this Settings tab to include those four fields once B7 lands. **GRP-1
   itself ships Settings with only Privacy + Leave Group + Delete Group** — the unambiguous, already-
   audited real endpoints.

**What the design reference specifies** (`#groups-view`):
- `sport-switcher-groups` + `group-switcher` — horizontal pill rows (sport filter, then "All" +
  each joined group by name), same pattern as Home Feed's `SportSwitcher`.
- `group-cover` — a banner header shown only when a specific group is selected: colored band (sport
  ramp), group icon, name, member count, "All groups" back button. New component — nothing like it
  exists in the current `GroupsPage.tsx`.
- Two-column body (`2.1fr 0.9fr`): `group-main` (left) + a **persistent right rail** (Upcoming
  matches / Trending hashtags / Group broadcasts — unaffected by anything happening in `group-main`,
  same widgets as Home Feed's rail).
- `group-main` when "All" is selected — a discovery panel: search input + "Join Group"/"Create
  Group" buttons + a list of group cards (avatar, name, member count) to open. **Replaces** today's
  modal-based `CreateGroupModal`/`JoinGroupModal` flow with an inline panel — a real restructure,
  not just an addition.
- `group-main` when a specific group is selected — an internal vertical tab list (narrow, ~150px,
  icon + label, 3 items) + content pane, nested inside `group-main` itself (the persistent right
  rail above stays outside this tabbed area):
  - **Posts** (default/first tab) — composer + group feed, reusing the same comment-dialog pattern
    (`openDialog`) as Home Feed. Already exists in production (`CreatePostForm` + `Feed`, real
    backend) — the work here is nesting it under a tab, not building it new.
  - **Chat** (second tab) — message bubbles (own messages right-aligned/accent background, others
    left-aligned/neutral background with sender name), input + Send. Fully interactive in the
    reference's vanilla-JS mock, but **there is no chat backend at all** (no `conversations`/
    `messages` tables, no real-time delivery — "designed, not implemented" per `PROGRESS.md`).
    Shipping this as if it works would be misleading (messages wouldn't persist past a refresh) —
    see open decision #1.
  - **Settings** — group name + description, a Privacy toggle (Public/Private pills), and a "Leave
    Group" danger-styled button in the reference. **This ticket adds gating and a Delete Group
    action not shown in the reference** — see decisions #2 and #4 above. Notifications toggle from
    the reference is dropped (decision #3).

**Backend mapping — what's real vs. what needs scoping:**

| Reference element | Backend today | Notes |
|---|---|---|
| Posts tab (composer + feed) | Real, already shipped | Just needs to move under the new tab |
| Group cover banner | Real data (`Group` name/avatar/sportId/member count already fetched) | New component only |
| "All groups" discovery panel | Real (`GET /api/groups/public`, join-request/create endpoints) | New component; replaces the two existing modals |
| Settings → Privacy (Public/Private) | Real — `Group.isPrivate`, settable via `PUT /api/groups/{groupId}` (owner/admin) | Member sees read-only |
| Settings → Leave Group | Real — `DELETE /api/groups/{groupId}/leave` | No client UI exists for this today; owner must transfer ownership first (existing rule) |
| Settings → Delete Group | Real — `DELETE /api/groups/{groupId}` (owner only) | Not in the reference; added per decision #2, bottom of Settings tab |
| Settings → Notifications toggle | **No backend found** — dropped from scope | Decision #3 |
| Settings → `allowMemberPosts`/`requirePostApproval`/`allowMemberInvites`/`maxMembers` | Real but not wired in this ticket | Deferred to **GRP-2**, blocked on **B7**'s audit — decision #4 |
| Chat tab | **No backend at all** | Built as interactive local-state UI per decision #1, with a "not saved" disclaimer |

**What ships:**
- `group-cover` banner component.
- Restructure `group-main` into two states: "All groups" discovery panel and a per-group tabbed
  view.
- Vertical tab control (Posts / Chat / Settings) nested inside `group-main`, narrow (~150px), icon +
  label, following this codebase's existing hand-rolled controlled-component pattern
  (`NavTabs.tsx`/`GroupSpaceSwitcher.tsx` — parent owns active tab, `role="tablist"`/`role="tab"`; no
  Radix Tabs primitive exists yet in `client/src/shared/ui/`).
- **Posts tab**: relocate the existing composer + feed here (real, already shipped — a move, not
  new backend work).
- **Settings tab**: Privacy toggle (owner/admin edit, member read-only), Leave Group (any member),
  Delete Group (owner only, bottom of the tab, danger-styled, separate from Leave Group). No
  Notifications toggle (dropped) and no `GroupSettings` toggle fields (deferred to GRP-2).
- **Chat tab**: interactive local-state UI matching the reference, with a "messages aren't saved"
  disclaimer — no backend.
- **Persistent right rail** stays outside the tabbed area, visible regardless of which tab or
  discovery-panel state is active — matches the reference exactly.

**Acceptance criteria:**
- Layout matches `design-reference-group-feed.html`'s `#groups-view` at 375/768/1280px (extend the
  existing visual-regression harness, same pattern as Home Feed's HF-10a/b).
- "All groups" discovery panel's search/join/create actions call the real endpoints already used by
  the modals being replaced — confirm no functional regression versus today's modal flow.
- Posts tab behaves identically to today's group feed (no regression in like/comment/create-post).
- Settings tab's Privacy toggle, Leave Group, and Delete Group all actually persist/execute via the
  real backend.
- Settings tab gating verified for all three roles: Member (read-only, no Delete button), Admin
  (can edit Privacy, no Delete button), Owner (can edit Privacy, Delete button visible and
  functional, confirms before deleting).
- Chat tab is clearly labeled as not persisting messages (disclaimer visible, not just implied).
- Keyboard-navigable tabs, visible focus states, no new axe violations (extends `a11y.spec.ts`).
- Storybook coverage for the new tab control, cover banner, and discovery panel, including all
  three Settings-tab role states.

---

### GRP-2 · Adapt Settings tab to the full group settings data set
**Status:** `DONE` (2026-07-21) · **Summary:** `client/docs/GRP-2_SETTINGS_TAB_FULL_DATA_SET.md`
**Type:** Feature · **Dependency:** B7 (`modules/social/group-impl/docs/BACKLOG_MVP.md`, `DONE`)

**Origin:** filed alongside GRP-1 — GRP-1 ships the Settings tab with only Privacy/Leave/Delete
(unambiguous real endpoints). The four `GroupSettings` fields (`allowMemberPosts`/
`requirePostApproval`/`allowMemberInvites`/`maxMembers`) are also real but were deliberately left
out of GRP-1 pending B7's audit of the split-contract permission model.

**Delta (executed, corrects the draft above):** B7 shipped after this ticket was filed and replaced
`maxMembers` entirely with fixed group-type tiers (read-only, no settable cap) — **no number field
was built**; only a read-only "Group type" row shows the tier name. The three toggles are
**owner-only** (B7 confirmed `updateGroupSettings` is stricter than Privacy's owner+admin
`updateGroup`), not "same gating shape as Privacy" as originally guessed. Shipped with a
draft/Save flow and a Discard/Save unsaved-changes guard (tab switch, group switch, in-app
navigation via a new `useBlocker`-dependent router migration, plus the browser's native
close/refresh prompt) — beyond the ticket's original text, added mid-session. Full writeup: the
summary doc above.

**Delta 2 (same day, requested after the above shipped):** reorganized into two default-expanded
collapsible sections — **General** (name/description, Privacy, rules/schedule, Group type) and
**Permission** (the three toggles) — and added `rules`/`schedule` as new editable fields (existed
on the backend since B6b, never wired client-side — `GroupResponse` doesn't return them, only
`GET .../info` does). Rules/schedule share the *same* draft/Save/guard as the toggles, per explicit
user decision, rather than a second independent save flow. Full writeup: the summary doc above.

---

### GRP-3 · Members tab — group member management
**Status:** `DONE` (2026-07-21) · **Summary:** `client/docs/GRP-3_MEMBERS_TAB.md`
**Type:** Feature · **Dependency:** GRP-1 (`DONE`)
**Design reference:** none — no Members-tab markup exists in `design-reference-group-feed.html`
today; this ticket is scoped directly from the user's spec, not a mockup. Flag if a reference gets
added before pickup.

**Origin:** requested directly by the user (2026-07-20) — a new "Members" tab in `GroupTabs`,
positioned between Chat and Settings, for group member management.

**What ships:**
- New `GroupTabs` entry `'members'`, ordered **Posts → Chat → Members → Settings**.
- New `GroupMembersTab` component, two parts:
  1. **Header row** — a shared "find member" text input that filters all five lists below on
     `onChange` (case-insensitive substring match on name, no debounce — matches the literal spec)
     + an "Invite friend" button.
  2. **Five status-grouped lists**, all loaded together when the tab becomes active:
     - **Waiting for group approve** — pending join requests for this group. Visible to
       owner/admin only (hidden entirely for a `group_member`). Backed by the existing
       `GET/PUT /api/groups/{groupId}/join-requests*` (already owner/admin-gated server-side,
       `modules/social/group-impl`). Each row keeps the existing accept/decline actions.
     - **Waiting for user accept** — **scope broadened 2026-07-20 (delta from the original spec at
       the top of this ticket):** now shows *every* invitation the *current user* sent for this
       group that's still in flight — both `pending_owner` (awaiting owner/admin approval) and
       `pending_user` (owner/admin already approved, awaiting the invitee's reply), not just
       `pending_user` as originally scoped. User's reasoning: as the inviter, they want visibility
       into invitations they sent regardless of which stage they're stuck at, not only the
       approved-and-waiting-on-my-friend subset. Scoped to invitations sent by the viewer; **the
       whole section is hidden when empty**, not shown with an empty-state message. Backed by
       **B8, shipped 2026-07-20** (`modules/social/group-impl/docs/BACKLOG_MVP.md`,
       `modules/social/group-impl/docs/B8_INVITATION_STATUS_FILTER.md`): `GET
       /api/groups/{groupId}/invitations/sent` takes **no query param** and always returns both
       statuses in one page — **one request covers this whole section**, not two. Use each row's
       `status` to render a per-row label distinguishing the two in-flight states (e.g. "awaiting
       owner approval" vs. "awaiting {inviteeFirstName}'s response") rather than two separate
       sub-lists, unless a visual split reads better at implementation time.
     - **Group administrator** — members with `roleName` `group_owner` or `group_admin` (owner
       listed first — see open decision #1). Backed by `GET /api/groups/{groupId}/members`.
     - **Members** — members with `roleName` `group_member`. Same fetch as above, split
       client-side by role.
     - **Blacklist** — **no backend concept exists at all** (confirmed: no banned/blocked field,
       repository query, or endpoint anywhere in `group-impl`). Ships as a header + a permanent
       "Coming soon" empty state — no data, no actions. Real ban/block needs its own backend design
       pass (schema, ban/unban action, re-join blocking) before a follow-up client ticket can wire
       it — same treatment this backlog already gives the Matches/tournaments backend gap.
- **Invite friend modal** — opens on "Invite friend" click, search input pre-filled with whatever
  text is currently in the "find member" input (the spec's "preset search key"). Search results are
  **mocked** — a static "Search coming soon" state regardless of what's typed, no network call, no
  invite action wired. Real search + invite is **GRP-4** below.

**Open decisions made at scoping time (confirm before/at pickup if this feels wrong — same pattern
GRP-1 used):**
1. Owner is folded into "Group administrator" rather than a separate 6th section — the user's spec
   named exactly 5 sections.
2. None of the three backend endpoints involved (`getGroupMembers`, `getGroupJoinRequests`,
   `getMemberSentInvitations`) support a keyword filter — adding one to all three is out of
   proportion to this ticket. Each section fetches a single larger page (e.g. `size=100`) and
   filters client-side against "find member". Caps correct filtering at ~100 rows/section for MVP —
   a known scaling limit (same spirit as this backlog's A7/A8 N+1 notes), not silently swept under
   the rug.

**Backend mapping:**

| Section | Backend today | Notes |
|---|---|---|
| Waiting for group approve | Real — `GET/PUT /api/groups/{groupId}/join-requests*` | Already owner/admin-gated |
| Waiting for user accept | Real — B8 (`DONE`) | One call, no query param, returns both `pending_owner` and `pending_user` rows — split by `row.status` |
| Group administrator / Members | Real — `GET /api/groups/{groupId}/members` | No keyword filter — see open decision #2 |
| Blacklist | **No backend concept at all** | Ships as a permanent empty state; needs its own design pass |
| Invite friend modal | N/A — mocked on purpose in this ticket | Real wiring is GRP-4 |

**Acceptance criteria:**
- Members tab appears between Chat and Settings in `GroupTabs`, keyboard-navigable like the
  existing three.
- All five section headers render for an active group; "Waiting for group approve" hidden for
  non-owner/admin; "Waiting for user accept" hidden when empty.
- Typing in "find member" filters all visible lists in place, no navigation/reload.
- "Invite friend" opens a modal pre-filled with the current search text and a static "coming soon"
  result state — confirmed no network call.
- Storybook coverage: owner/admin/member role states × populated/empty variants for the five
  sections.
- No new axe violations (extends `a11y.spec.ts`).

**Executed:** shipped exactly as scoped above — new `GroupMembersTab`/`InviteFriendModal` components,
5 new API hooks (`useGroupMembers`/`useGroupJoinRequests`/`useSentInvitations`/
`useAcceptJoinRequest`/`useDeclineJoinRequest`), orchestration hook `useGroupMembersTabData`, all
wired into `GroupsPage`/`GroupTabs`. **Delta found and closed while satisfying this ticket's own "no
new axe violations (extends `a11y.spec.ts`)" AC**: `a11y.spec.ts` had zero Groups-page coverage at
all — both GRP-1 and GRP-2 claimed to extend it in their own acceptance criteria but neither actually
did (confirmed by reading the file directly). Added one baseline check (owner role, Members tab,
1280px) rather than silently carrying the gap forward a third time; not a full breakpoint/tab
backfill for Posts/Chat/Settings, which stays a known gap for a future ticket if it matters. New
`e2e/flows/group-members.spec.ts`, `client/docs/E2E_OVERVIEW.md` updated to match (§3 directory
listing, new spec's test table, `a11y.spec.ts`'s table extended). Verified live against a real
running backend beyond MSW (register → sport profile → create group → join-request → accept →
re-fetch members, via curl) — every new endpoint's response shape matched the client types exactly.
Full writeup: `client/docs/GRP-3_MEMBERS_TAB.md`.

---

### FRIEND-1 · Friends page — rail, profile/chat panel, directory search, friend-request actions
**Status:** `DONE` (2026-07-22, `client/docs/FRIEND-1_FRIENDS_PAGE.md`) · **Type:** Feature ·
**Dependency:** none blocking — backend `U1` (friendship
system) and `U6` (user search) are both `DONE` (`modules/user/user-impl/docs/BACKLOG_MVP.md`); the
`/friends` route and nav tab already exist (`NavTabs.tsx`/`AppShell.tsx`), currently a
`ComingSoonPage` stub.
**Design reference:** `client/design-reference/design-reference-friend.html` (interactive, same
static-baseline convention as `design-reference-home-feed.html`/`design-reference-group-feed.html`).

**Origin:** filed 2026-07-22 while picking up GRP-4 — GRP-4's invite-to-group flow requires the
invitee already be the inviter's friend (backend `A6`'s `areFriends` gate), but there was no
client-side way to become anyone's friend at all. The backend friendship system (`U1`) has existed
and been `DONE` since before the Home Feed epic even started; nothing in either epic doc ever
scoped a client Friends page against it. Inserted ahead of GRP-4 in the queue (user decision) — see
GRP-4's own delta entry.

**What ships:**
- New `/friends` page replacing the `ComingSoonPage` stub. Right rail (Upcoming/Trending/Group
  broadcasts) is unchanged — same shared components Home Feed and Groups already use.
- Main area is a fixed-width `FriendRail` (left) + flexible `FriendContent` (right), per the design
  reference's `#friend-rail`/`#friend-content` split.
- **FriendRail:**
  - Header row: a shared search input (filters the rendered friend list on every keystroke, no
    debounce — same "no debounce" precedent `GroupMembersTab`'s "find member" input already set)
    plus an icon-only "Add friend" button (`aria-label="Add friend"`) that toggles Add mode. The
    input has a clear ("x") affordance that always returns to the default friend-list view (exits
    Add mode too, per the reference's behavior).
  - Default mode: 4 collapsible, status-grouped sections, each header formatted `{Label} (count)` +
    a chevron toggle: **Online**, **Friend Requests**, **Offline**, **Blocked**. See the presence/
    blocked decisions below for what actually populates each.
  - Add mode: replaces the section list with a left-aligned "← Back to friend list" button + one
    ungrouped results section titled `Matches for "{query}"` / `No users found for "{query}"`,
    sourced from a **debounced** real query against `GET /api/users/search?q=` (U6) — gated on
    trimmed length ≥ 2 (the backend 400s below that: `"Search keyword must be at least 2
    characters"`).
- **FriendContent** (empty state: "Select a friend to view their profile and chat" until a rail row
  is selected). Fixed 50/50 vertical split when a row (friend or search result) is selected:
  - **Top half — profile panel:** cover strip + avatar + name (`GET /api/users/{userId}`, public —
    needed for search-result rows since `U6`'s `UserSearchResponse` doesn't carry `bio`/`coverUrl`;
    friend-list rows already have this from `GET /api/users/friends`'s full `UserResponse`), sport
    pills (`GET /api/sports/profiles/user/{userId}`, public, same endpoint SPORT-1 already wired —
    fetched **only for the selected person**, not every rail row, to avoid N+1 across the whole
    list), a collapsible "Achievements" section — **collapsed by default** (user decision,
    2026-07-22: reduces empty space for a friend with few sports/no bio, since the section's body
    is just static "Coming soon" text with no backend anywhere) — and a docked action bar driven by
    the selected person's real friendship state — not a mockup-style
    `isDirectory` branch, since the backend already tells us this directly:
    - `friendshipStatus === 'NONE'` → "Send a friend request" (enabled) →
      `POST /api/users/friends/requests`. Gating on real status (not always-enabled) matters here:
      re-sending a still-pending request 400s (`"Friend request already pending"`), not idempotent
      like group invitations.
    - `'PENDING_SENT'` (caller sent it) → disabled "Waiting for response".
    - `'PENDING_RECEIVED'` (caller received it) → "Decline" / "Accept" buttons →
      `PUT /api/users/friends/requests/{requestId}/decline` / `/accept`. The `requestId` isn't on
      the search result or `UserResponse` — resolve it by matching the selected person's `userId`
      against the already-loaded `getPendingReceivedRequests()` list (loaded for the rail's Friend
      Requests section — no extra call needed).
    - `'FRIENDS'` → no action bar (matches the reference exactly — accepted friends get none).
  - **Bottom half — chat panel:** local component state only, same precedent as `GroupChatTab`
    before CHAT-2 (message list + input + Send button, a "not saved"-style disclaimer, nothing
    persisted, no backend call at all) — **per user decision, this ships as a working UI now, real
    wiring is a separate follow-up** (filed as DM-1/DM-2, since archived — see
    `documentation/md/archive/chat/DM-1_DM-2_TICKETS.md` — pending a fresh chat re-plan), not a
    placeholder.

**Design decisions resolved before pickup (2026-07-22, user decisions):**
- **Online/Offline:** no presence system exists anywhere in the backend (no heartbeat, session
  tracking, or WebSocket presence — `lastLoginAt` exists but isn't a reliable "online now" signal).
  Ships exactly as the reference shows (both sections render), but **"Online" always renders empty**
  — same permanent "Coming soon"-style placeholder treatment GRP-3 gave its Blacklist section, not a
  fabricated status. Every accepted friend (`GET /api/users/friends`) renders under **Offline**.
- **Blocked:** no block/unblock endpoint, schema, or repository concept exists at all (confirmed,
  same gap class as GRP-3's Blacklist). Ships as a permanent "Coming soon" empty section.
- **Chat:** ships as a fully working local-state mock now (not deferred/placeholder-only) — real
  backend wiring is out of scope for this ticket, filed as DM-1 (backend)/DM-2 (client), since
  archived pending a fresh chat re-plan (`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`).

**Backend mapping:**

| Piece | Backend | Notes |
|---|---|---|
| Friends list | Real — `GET /api/users/friends` (U1, `DONE`) | Full `UserResponse` (bio/avatarUrl/coverUrl included) |
| Pending requests (sent/received) | Real — `GET /api/users/friends/requests/{sent,received}` (U1) | Merge both into the rail's one "Friend Requests" section; keep each row's direction for the content-pane action bar |
| Send/accept/decline/cancel | Real — `POST /requests`, `PUT /requests/{id}/accept`, `PUT /requests/{id}/decline`, `DELETE /requests/{id}` (U1) | Send 400s "already pending" on a duplicate — gate the button on real status |
| Directory search | Real — `GET /api/users/search?q=` (U6, `DONE`) | 400s under 2 trimmed chars; `friendshipStatus` per row reused directly for the content-pane action bar once selected |
| Sport pills | Real — `GET /api/sports/profiles/user/{userId}` (public) | Selected person only, not every rail row (N+1 avoidance) |
| Full profile (bio/cover) | Real — `GET /api/users/{userId}` (public) | Needed for search-result rows only |
| Online/offline presence | **No backend concept exists** | Online ships permanently empty; all friends render under Offline |
| Block/blacklist | **No backend concept exists** | Same treatment as GRP-3's Blacklist — permanent "Coming soon" |
| Direct-message chat | **No backend concept exists at all** (not even a filed ticket, unlike group chat's CHAT-1) | Ships as local-state mock only; real wiring filed as DM-1/DM-2, since archived (`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`) pending a fresh chat re-plan |

**Out of scope:**
- Real-time presence/online status — needs its own backend design pass before a follow-up ticket.
- Real direct messaging — filed as DM-1/DM-2, since archived pending a fresh chat re-plan.
- Unfriending (`DELETE /api/users/friends/{friendId}` exists server-side) and blocking — neither
  appears in the reference's action bar; not built here. Flag at pickup if this feels wrong.
- Achievements — permanent "Coming soon", no backend, no follow-up filed.

**Acceptance criteria:**
- `/friends` renders the rail + content two-column layout; right rail unchanged from Home
  Feed/Groups.
- Typing in the rail search filters all four sections' visible rows in place (case-insensitive
  substring on name); each section independently collapsible, header shows `{label} (count)`.
- "Add friend" swaps the section list for "← Back to friend list" + one grouped
  `Matches for "..."`/`No users found for "..."` result section, backed by a debounced real search
  (≥ 2 trimmed chars); the input's "x" and "← Back" both return to the default friend-list view.
- Selecting any rail row (friend or search result) renders the fixed 50/50 content split: profile
  panel (cover/avatar/name/sport pills/collapsible Achievements-coming-soon section, collapsed by
  default/action bar) + chat panel (local mock, disclaimer visible).
- The docked action bar reflects real `friendshipStatus`/pending-request state (Send/Waiting/
  Accept-Decline/nothing) and each action calls its real endpoint, updating both the rail and
  content pane afterward (e.g. accepting a request moves that person from "Friend Requests" into
  "Offline").
- Storybook coverage: `FriendRail` (all 4 section states incl. collapsed/populated/empty, Add mode
  with results/no-results) and the profile-panel action bar (all 4 `friendshipStatus` variants).
- No new axe violations (extends `e2e/flows/a11y.spec.ts`, same convention GRP-3 established for
  the Groups page).

**Executed:** shipped exactly as scoped above — no scope divergence. Found and fixed a real gap
mid-implementation: `useSportProfiles` (SPORT-1) was hardcoded to the current authenticated user,
so a new `useSportProfilesForUser(userId)` was extracted into `shared/hooks/` (existing test
unaffected, same query/URL/mapping just relocated) — reused for both the current user's own sport
badges (right rail's `UpcomingMatches`) and any selected friend/search result's sport pills. Added
`shared/hooks/useDebouncedValue.ts` (new, generic — no debounce hook existed anywhere in this
codebase; every prior search flow, e.g. `JoinGroupModal`, used explicit-submit instead). New MSW
handler (`e2e/mocks/handlers/friends.ts`, stateful) + `friends-journey.spec.ts` (7 steps) +
`a11y.spec.ts` extension, all green; `tsc -b`/`pnpm lint`/Vitest (487 tests)/Storybook build all
clean. **Live-verified against the real running backend** (not just MSW): registered two real
users via the actual UI, one searched the real directory for the other and sent a real friend
request, the other saw and accepted the real incoming request, both reloaded and confirmed the
real accepted-friend state and correct action-bar transitions on both sides.
`pnpm test:visual`'s 18 failures are the pre-existing Windows-vs-Linux font-rendering noise floor
(HF-12..19's precedent) on Home Feed/post-modal baselines — FRIEND-1 touches neither surface, and
no visual-regression harness was in this ticket's own scope. Full writeup:
`client/docs/FRIEND-1_FRIENDS_PAGE.md`.

---

**DM-1/DM-2 archived 2026-07-26** (user decision) — full text moved to
`documentation/md/archive/chat/DM-1_DM-2_TICKETS.md`, folded into the fresh chat re-plan.

---

### GRP-4 · Wire invite-friend search to the real backend
**Status:** `DONE` (2026-07-22, `client/docs/GRP-4_INVITE_FRIEND_REAL.md`) · **Type:** Feature ·
**Dependency:** GRP-3 (`DONE`), FRIEND-1 (`DONE`)
**Origin:** filed alongside GRP-3 — the invite-friend modal ships with mocked "coming soon" results
in GRP-3 on purpose, so the modal's UI/UX lands independently of the real search+invite call chain.

**What ships:** replace the modal's mock result state with a real, debounced query against `GET
/api/users/search?q=&page=&size=` (`U6`, `DONE` —
`modules/user/user-impl/docs/U6_USER_DISCOVERY.md`), and wire each result's "Invite" action to the
existing `POST /api/groups/{groupId}/invitations` (B1, `DONE`) — which already 400s server-side if
the inviter/invitee aren't friends (`A6`'s `UserFriendService.areFriends` gate) or if
`allowMemberInvites` is off for the group. Surface that 400 as an inline per-result error, not a
modal-wide failure. Confirm at pickup whether `U6`'s response already excludes existing
members/already-invited users from results — don't assume either way.

**Delta (2026-07-22, picked up then reverted):** this ticket was briefly started and reverted back
to `TODO` — the user flagged that `B1`'s invite endpoint requires the inviter/invitee to already be
friends (`areFriends` gate), and the client had **no way to become someone's friend at all** at that
point (no Friends page, no send/accept-request UI, despite the backend's `U1` friendship system
being `DONE` since long before). Every non-friend row in this modal's real search results would've
been a dead end. **FRIEND-1** was filed to close that gap and inserted ahead of this ticket in the
queue — now `DONE` (`client/docs/FRIEND-1_FRIENDS_PAGE.md`), so this ticket is unblocked and ready
to pick up for real.

**Delta (2026-07-22, resolved at pickup):** confirmed `U6` does NOT exclude existing
members/already-invited users (no `groupId` param exists on the endpoint at all) — so the client
resolves both client-side against `GroupMembersTab`'s already-loaded members/sentInvitations
queries. **Supersedes this entry's original "surface the 400 as an inline error" framing for the
non-friend case**: non-friend search results are dropped from the list entirely (user decision, not
shown disabled/inline-erroring), since `friendshipStatus` is already known per-row without a click.
Already-a-member/already-invited friends are NOT filtered out — they're sorted to the end of the
list, badged instead of actionable. The inline-per-result-error treatment described above still
applies to the two 400s that aren't knowable ahead of a click (`allowMemberInvites` off, capacity
full). Also fixed a real pre-existing bug found while live-verifying against the backend:
`UserSearchResult.username` (FRIEND-1's type) is nullable in practice, not always a string — widened
the type and guarded the render. Full writeup: `client/docs/GRP-4_INVITE_FRIEND_REAL.md`.

**Found while closing out this ticket (2026-07-23): the invitation lifecycle past "create" is entirely
unwired client-side** — an invitation this ticket sends can never actually be approved or accepted
through the app. Filed as **GRP-7** below, not fixed inline (see that entry for the full gap).

---

### GRP-7 · Wire the invitation approve/accept lifecycle
**Status:** `DONE` (2026-07-24, `client/docs/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`) · **Type:**
Feature · **Dependency:** GRP-3 (`DONE`), GRP-4 (`DONE`), **B11**
(`modules/social/group-impl/docs/BACKLOG_MVP.md`, `TODO`) · **Filed:** 2026-07-23, discovered while
closing out GRP-4

**Origin:** `POST /api/groups/{groupId}/invitations` (B1) creates every invitation — even one sent by
the group's own owner — with `status="pending_owner"` unconditionally
(`GroupServiceImpl.createInvitation`, no special-case for an owner-as-inviter). The controller's own
Javadoc names the intended flow: *"3-step flow: member invites -> owner approves -> invitee
accepts."* GRP-3 and GRP-4 together wired only step 1 (create) and a read-only view of what's been
sent (`GET .../invitations/sent`, GRP-3's "Waiting for user accept" — displays both `pending_owner`/
`pending_user` rows with a status label, but no actions on either). Steps 2 and 3 have **zero**
client wiring — six endpoints are entirely unused anywhere in this app:

| Endpoint | Purpose |
|---|---|
| `GET /{groupId}/invitations` | owner/admin's queue of `pending_owner` invitations awaiting their decision |
| `PUT /invitations/{id}/approve` | owner/admin approves -> flips to `pending_user` |
| `PUT /invitations/{id}/decline` | owner/admin declines -> `declined_by_owner` |
| `GET /invitations/user` | the invitee's own pending (`pending_user`) invitations, across all groups |
| `PUT /invitations/{id}/accept` | invitee accepts -> becomes a member |
| `PUT /invitations/{id}/reject` | invitee declines -> `declined_by_user` |

Net effect as GRP-4 ships: an invitation can be *sent* but never actually resolves — it sits at
`pending_owner` forever, with no UI anywhere (not even for the group's own owner) to move it
forward. Confirmed by user (2026-07-23): this is a real gap, not a misunderstanding of existing
behavior — file as its own ticket rather than fix inline.

**What ships — two parts, one ticket (bundles a cohesive user-facing gap, same reasoning FRIEND-1
used to bundle rail/profile/chat under one ticket rather than three). Design decisions below
resolved 2026-07-23:**

1. **Owner/admin approval.** `GroupMembersTab`'s "Waiting for group approve" section merges
   `JoinRequest` rows and `pending_owner` `GroupInvitation` rows into **one chronological list**
   (sorted by `createdAt`), not two labeled sub-groups — row layout adapts per type (a join-request
   row is just the requester; an invitation row shows both inviter and invitee). "find member"
   filters an invitation row by `inviteeFullName` (the prospective member), not the inviter.
2. **Invitee acceptance.** A new "Invitations" section on `GroupDiscoveryPanel`'s "All groups"
   landing state (shown when no group is selected), above the joined-groups grid, hidden entirely
   when empty. Each row: group name + "Invited by {inviterFullName}" + Accept/Reject.
   **Post-accept:** auto-navigates into the newly joined group. Since `GroupInvitationResponse`
   carries no `sportId`, the handler calls `setActiveSport('all')` before selecting the group —
   guarantees the group is visible regardless of its sport, avoiding a fragile refetch-then-lookup
   race (`feedSpaceStore`'s own invariant requires `activeSport` and the selected group's sport to
   always match).

**Delta (2026-07-23, reverted from `IN PROGRESS` back to `TODO`):** picking this up for real
surfaced that the backend's join-request and invitation tables have **zero cross-awareness** — three
real race conditions exist between them (e.g. a member invites A, A independently sends a join
request before the owner approves; today both sit as unrelated pending rows instead of resolving to
immediate membership). Same "found a blocking gap mid-pickup" pattern as GRP-4 hitting FRIEND-1's
absence. Filed as backend ticket **B11**
(`modules/social/group-impl/docs/BACKLOG_MVP.md`) — GRP-7 should be built against B11's corrected
business rules, not shipped first and patched after. Full schema/use-case background (including two
diagrams — a UML use case diagram and per-flow sequence diagrams) written to
`documentation/md/adr/JOIN_GROUP_ADR.md` during this same pickup. **Pick up GRP-7 again only once
B11 is `DONE`.**

**Backend:** B11 is now `DONE` (2026-07-23,
`modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`) — unblocked. B11 changed 3
service methods' business rules (`createInvitation`, `approveInvitation`, `createJoinRequest`), all
without any response-contract change: `createJoinRequest`'s short-circuit case (a `pending_user`
invitation already exists) was resolved by always creating a real `GroupJoinRequest` row — directly
at `status="accepted"` — rather than the synthetic-response or contract-change options the ticket
had floated, so no client-side type/parsing change is needed for that case.

**Note for this ticket (added by B11, 2026-07-23):** B11's rules 2 and 3 (the join-request/invitation
short-circuits) deliberately leave **two `accepted` rows** behind for a single real join event — one
`GroupInvitation`, one `GroupJoinRequest` — both for the same (group, person) pair. Nothing merges or
suppresses either row server-side. If GRP-7 (or any future view) lists accepted/historical
membership events across both endpoints, a single join can show up twice. How to de-duplicate or
label this in the UI — if at all — is an open decision for whoever builds that view, not resolved by
B11.

**Delta (2026-07-24, resolved at pickup):** the B11 dual-accepted-row note above turned out to be a
non-issue for this ticket specifically — both of GRP-7's lists (the Members tab's approval queue,
the Invitations section) only ever show *pending* items; a B11 short-circuit just makes the row
disappear on the next refetch, identical to a normal accept/approve. No de-duplication logic needed.
Two design decisions not spelled out in the original spec, made during implementation: (1) the
merged approval-queue's join-request and invitation rows share the same "Accept"/"Decline" button
labels rather than distinguishing "Approve" for invitations — the technical difference is invisible
to the user; (2) the merged queue sorts oldest-first (FIFO), while the new Invitations section sorts
newest-first — a personal inbox reads better with the newest arrival on top, unlike an approval
queue. Full writeup: `client/docs/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`.

**Addendum (2026-07-24, user-requested):** a "Cancel" button on "Waiting for user accept" rows,
shown only while `status === 'pending_owner'` — the inviter withdraws their own not-yet-approved
invitation. Needed new backend ticket **B12**
(`modules/social/group-impl/docs/BACKLOG_MVP.md`) — `cancelInvitation`/`DELETE
/invitations/{invitationId}`, mirroring A3's `cancelJoinRequest`. Full detail in the "Addendum"
section of `client/docs/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md`.

---

### GRP-8 · Sport pill follows an opened group, merged multi-inviter display, reason-gated reject, join-request withdraw, and sport-add confirmation on accept
**Status:** `DONE` (2026-07-25, `client/docs/GRP-8_INVITATION_LIFECYCLE_POLISH.md`) · **Type:**
Enhancement · **Dependency:** GRP-3, GRP-4, GRP-7 (all `DONE`, no code blocker) · **Filed:**
2026-07-24, user-requested directly, amended same day with two more items (parts 4–5 below) before
pickup.

**Delta (2026-07-25, resolved at pickup — part 5's UI shape changed):** the ticket originally sketched
adding an optional `note`/description prop to `AddSportModal` itself. User revised this at pickup: a
separate `AddSportIntroDialog` shows the explanatory copy first, with a single **OK** button (not a
Confirm/Cancel pair) — only after OK does the existing, unmodified `AddSportModal` open. Everything
else shipped as scoped below.

**Follow-up fix (2026-07-25, same day, user-reported, revised three times):** part 1 as first shipped
only synced group→sport (opening a group drives the pill), not the reverse. Repro: open a football
group (pill correctly shows Football) → go to Home Feed → switch to "All" there → return to Groups →
the football group's tabs are still showing under a mismatched "All" pill; the same root cause meant
clicking "All" while viewing a specific group did nothing.

Two intermediate revisions (shared store always clears the group on "All"; then a one-directional
guard plus a derived `effectiveActiveSport`) each fixed a real problem the previous one introduced,
but both still kept `activeSport` as one field shared cross-page.

**Final revision — full separation (user-requested directly):** split `feedSpaceStore` into two
independent stores — `homeFeedStore.ts` (Home Feed's own `activeSport`) and `groupsPageStore.ts` (the
Groups page's own `activeSport`/`selectedGroupId`/`selectedGroupSportId`/`selectGroup`). Switching
sport on either page can now never affect the other, by construction — no shared field to drift, no
guard logic needed to compensate. `effectiveActiveSport` was removed entirely; `GroupsPage.tsx`'s pill/
`Feed`/`UpcomingMatches` go back to reading `groupsPageStore.activeSport` directly, which is now always
correct since only this page's own actions ever write to it (`selectGroup`'s derivation, or
`guardedSetActiveSport`'s explicit deselect when the picked sport doesn't match the open group).
Home Feed's `goToGroup` (a group post's "> groupname" link) writes into `groupsPageStore.selectGroup`
directly as a deliberate one-off cross-store call ("open this group when you land there"), without
touching its own `homeFeedStore.activeSport`. `client/CLAUDE.md`'s cross-page-state section updated —
its original "promote activeSport to one shared store" guidance is struck through with a note
explaining the reversal, since this is a real architecture decision future tickets should know about.
Also wired `GroupsPage`'s `SportSwitcher` through the existing unsaved-Settings-changes guard, since a
sport switch can silently discard an unsaved draft the same way every other group-deselecting action
already guards against.

`pnpm e2e` is now fully green (46/46) — the earlier "couldn't verify" was a stray leftover dev-server
process Playwright was silently reusing (`reuseExistingServer`), not a code issue; killing it and
re-running clean surfaced 3 real, since-fixed issues: a locator bug in the new cross-page test
(`{ name: 'All' }` without `exact: true` also matched "Foot**ball**"/"Basket**ball**"), a mock-server
override (`sportProfilesEmpty`) that only faked the GET response and left the real session state at
the 3-profile default, and 2 pre-existing `feed-groups-journey.spec.ts` steps whose "sport pill stays
on All" assumption part 1 legitimately invalidates (now reset the pill explicitly where needed). Full
breakdown in the summary doc. `pnpm test` (529), `tsc -b`, lint, and the Storybook build are all clean.

**Origin:** five separate UX gaps found using the Groups page after GRP-7 shipped the invitation
lifecycle:
1. Opening a specific group (from the switcher pill, a discovery-panel card, or right after
   creating one) leaves `SportSwitcher`'s active pill on whatever it was before — usually "All" —
   instead of reflecting the opened group's actual sport.
2. GRP-7's `GroupInvitationsSection` (invitee-facing) renders one row per invitation with a single
   inviter name; it doesn't merge multiple members' invitations to the same person into one row, and
   Reject fires immediately with no confirmation or reason capture.
3. The user's own sent join requests are already fetched (`useJoinRequests`, wraps `GET
   /groups/join-requests/user/{userId}`, used today only to badge "already requested" rows inside
   `JoinGroupModal`) but have no visible list anywhere with a way to withdraw one —
   `cancelJoinRequest`/`DELETE /join-requests/{requestId}` exists and works server-side and is
   entirely unused client-side.
4. **(added same day)** The Members tab's owner/admin approval queue (GRP-3/GRP-7's merged
   chronological list) has the identical single-inviter display gap as item 2, on the owner/admin
   side instead of the invitee side.
5. **(added same day)** Accepting an invitation for a group whose sport the invitee doesn't already
   have a profile for should offer to add that sport profile as part of accepting, rather than
   silently leaving the invitee a member of a sport-group with no matching sport pill.

**Backend redesign needed for items 2 and 4 (resolved 2026-07-24):** confirmed against
`GroupServiceImpl.createInvitation`'s `existsByGroupIdAndInviteeIdAndStatusIn` check that at most one
pending invitation can exist per (group, invitee) pair today — a second member's invite attempt
silently returns the first inviter's existing row untouched, so "multiple invitations to the same
person" cannot currently exist as multiple rows to merge. Filed as backend ticket **B14**
(`modules/social/group-impl/docs/BACKLOG_MVP.md`, `TODO`) to track every inviter against **one**
canonical invitation row (a new `group_invitation_inviters` join table) rather than allowing
duplicate rows bulk-actioned together — the duplicate-row design would reintroduce the exact
multi-table-race class **B11** was filed to eliminate (two independently-transitioned rows for one
real event can drift out of sync). With B14, `GroupInvitationResponse.inviterFullNames: string[]`
is real backend data and a single approve/accept/reject/cancel already covers every co-inviter — no
client-side row-merging or bulk-action looping needed at all.

**Backend addition needed for item 5 (resolved 2026-07-24):** `GroupInvitationResponse` carries no
`sportId` today (confirmed) — needed to know the group's sport without a second round trip, both for
item 1's accept-invitation exception (below) and item 5's profile check. Filed as backend ticket
**B15** (same file, `TODO`) — purely additive (`sportId`/`sportName` fields), no schema change.

**What ships — five parts:**

1. **Sport pill follows the opened group.** `feedSpaceStore.selectGroup(groupId, groupSportId)` now
   also sets `activeSport` to the sport matching `groupSportId` whenever `groupId` is non-null — a
   group is 1:1 with a sport, so this is an unambiguous derivation done once at the store level, not
   per call site. `GroupSpaceSwitcher`'s pill click, `GroupDiscoveryPanel`'s card click, and
   `CreateGroupModal`'s `onSuccess` all already pass `groupSportId` today, so none of the three needs
   its own change. Selecting "All" (`groupId === null`) leaves `activeSport` untouched, matching
   today's behavior — only opening a *specific* group drives the pill.
   - **GRP-7's accept-invitation callback no longer needs its `'all'`-first workaround, now that B15
     ships `sportId` on the invitation:** `useGroupInvitationsData`'s `onAccepted` can call
     `setActiveSport(sportKeyForId(invitation.sportId))` directly before `selectGroupAndShowPosts`,
     the same as every other call site, instead of detouring through `'all'` and re-deriving the
     sport after a refetch. If GRP-8 is picked up before B15 ships, keep the existing `'all'`-first
     workaround for this one call site as a documented stopgap rather than blocking the rest of the
     ticket on it.
   - Extend `feedSpaceStore.test.ts`'s `selectGroup` cases to cover the new `activeSport` side effect
     (including that selecting "All" doesn't touch it).

2. **Invitations section (invitee-facing) shows every co-inviter; Reject requires a reason.**
   - `GroupInvitationsSection` renders `inviterFullNames` (B14): "Group invitation from
     {inviterFullNames[0]}" for one inviter, Oxford-comma joined ("…from {A}, {B}, and {C}") for
     more — add a small `formatNameList()` helper (`shared/lib/`) if nothing equivalent exists yet.
     Reuse this same helper for part 4 below.
   - Reject opens a new `RejectInvitationConfirmDialog` (same `Dialog`/`DialogContent`/`DialogHeader`
     shape as `DeleteGroupConfirmDialog`) with a `Textarea` for the reason. Reject stays disabled
     until the reason is non-empty (same required-field gating precedent as `CreatePostForm`'s Post
     button) — flag at pickup if a reason should be optional instead. Confirming calls
     `useRejectInvitation()` with the reason, targeting the one invitation id the merged row
     represents (B14 guarantees exactly one canonical row per group+invitee, so no looping needed).
   - **Depends on backend ticket B13** (already filed, `TODO`) for the reason to actually persist —
     `PUT /invitations/{invitationId}/reject` takes no request body today. If B13 isn't ready by
     pickup, split this sub-item into its own follow-up rather than blocking the rest of this ticket,
     same "ship what's unblocked" precedent GRP-1/GRP-2 and GRP-3/GRP-4 already used.

3. **New "Join requests" section on `GroupDiscoveryPanel`'s "All groups" view**, below the
   joined-groups grid — section order top to bottom: Invitations → your groups grid → Join requests,
   matching the user's spec. New `useCancelJoinRequest()` hook (`DELETE
   /groups/join-requests/{requestId}`, mirrors `useCancelInvitation`'s shape exactly — blunt
   `feedKeys.all` invalidation). Reuses the existing `useJoinRequests(currentUserId)` for data (already
   pending-filtered server-side) — no new query endpoint needed. Each row: group name + "Withdraw"
   button, no confirmation dialog (the user's spec only asked for one on invitation reject — flag if
   this feels wrong at pickup). Hidden entirely when empty, same convention as the Invitations
   section.

4. **Members tab approval queue shows every co-inviter too.** `GroupMembersTab.tsx`'s invitation-row
   subtitle (currently `Invited by ${item.data.inviterFullName}`, singular) switches to the same
   `formatNameList(item.data.inviterFullNames)` helper part 2 introduces — the only change on this
   side, since B14 keeps Approve/Decline operating on the single canonical row exactly as today.

5. **Accepting an invitation offers to add the group's sport if the invitee doesn't have it.** Before
   calling `acceptInvitation`, check whether `sportKeyForId(invitation.sportId)` (B15) is present in
   the current user's own `sportProfiles` (already loaded on `GroupsPage`/`useGroupsPageData`). If it
   is, accept proceeds exactly as today. If not, open **`AddSportModal`** (already exists, SPORT-1) —
   reused rather than a bespoke dialog, since adding a valid sport profile needs at least a skill
   level (a required field `AddSportModal` already collects) and it already handles the 3-profile-cap
   case via its existing error state. Pre-select the invitation's sport (pass a single-item
   `availableSports` list) and add a new optional note/description prop showing the user's requested
   copy: *"This {sportName} group — accepting this invitation will add this sport to your profile."*
   On successful sport-profile creation, proceed to call `acceptInvitation`; on cancel, the invitation
   stays pending and nothing else changes. **At-cap edge case (already at 3 active profiles):** let
   `AddSportModal`'s existing submit-error path surface it exactly as it does for the standalone "Add
   sport" flow today — don't special-case a blocking message here, since the user can already see and
   act on that same error there.

**Acceptance criteria:**
- Opening a specific group (pill, card, or a just-created group) switches `SportSwitcher`'s active
  pill to that group's sport; selecting "All" is unaffected; accepting an invitation still lands the
  user in the new group with the correct sport pill active, not stuck on "All" (directly, once B15
  ships — via the stopgap otherwise).
- Multiple members' invitations to the same person merge into one row naming every inviter, in both
  the invitee's Invitations section and the Members tab's approval queue; a single-inviter row still
  reads naturally ("Group invitation from {name}" / "Invited by {name}").
- Reject (invitee side) opens a confirmation dialog; Reject stays disabled until a reason is typed;
  confirming sends the reason and removes the row.
- The new Join requests section lists every pending join request the current user has sent, each
  with a working Withdraw button that removes it from the list and (verify live) also clears it from
  `JoinGroupModal`'s "already requested" badge.
- Accepting an invitation for a sport the invitee has no profile for opens `AddSportModal` with the
  requested note and the sport pre-selected; completing it adds the profile and then accepts the
  invitation; cancelling leaves the invitation pending. Accepting for a sport already in the
  invitee's profiles skips this step entirely.
- Storybook coverage: merged multi-inviter row (both the Invitations section and the Members tab
  approval queue), `RejectInvitationConfirmDialog` (empty/filled reason states), Join requests
  section (populated/empty), `AddSportModal`'s new note/pre-selected variant.
- No new axe violations (extends `a11y.spec.ts`, same convention every Groups-page ticket since GRP-1
  has followed).

---

### GRP-6 · Join Group modal — multi-select sport filter + grouped results
**Status:** `DONE` (2026-07-21, `client/docs/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md`) ·
**Type:** Enhancement · **Dependency:** A10
(`modules/social/group-impl/docs/BACKLOG_MVP.md` — backend, adds `sportIds` multi-value filter to
`GET /api/groups/public`) · **Filed:** 2026-07-21 (user-specified UX enhancement, picked up ahead of
GRP-4 by user decision) · **Supersedes:** GRP-5 (below) — GRP-5's static single-sport indicator is
subsumed by this ticket's interactive multi-select filter; GRP-5 is not built.

**Origin:** same underlying gap GRP-5 found (`JoinGroupModal`'s sport scoping is invisible to the
user), but the user specified a materially richer fix instead of a static indicator: an interactive,
multi-select sport filter — pre-seeded from page context — with results grouped by sport.

**A10 shipped (2026-07-21, `modules/social/group-impl/docs/A10_MULTI_SPORT_FILTER_PUBLIC_GROUPS.md`)
— no longer blocked.** The first design pass planned a client-side fan-out (one `usePublicGroups`
request per selected sport, each section resolving independently). User decision reversed this in
favor of a real backend multi-sport filter instead — simpler client state (a single query, one
`isLoading`/`isError` pair) at the cost of a small additive backend change, now live: `GET
/api/groups/public?sportIds=1&sportIds=2` (repeated query params, confirmed live-verified in A10).

**What ships:**
- **Header:** center-align `JoinGroupModal`'s header row (currently `flex items-center
  justify-between` in `JoinGroupModal.tsx:52` — title left, close button right). Restructure to a
  3-column layout (e.g. `grid grid-cols-[1fr_auto_1fr]`: empty spacer sized to match the close
  button — center title — close button) so `DialogTitle` visually centers in the header regardless
  of the close button's width, rather than just adding `justify-center` (which would look centered
  only by accident, since the close button isn't mirrored on the left).
- **Sport filter pills:** new multi-select pill row below the header, listing the current user's own
  sport profiles — same data source as `SportSwitcher` (`src/shared/components/SportSwitcher.tsx`)
  for the sport list itself, reusing `getSportIcon()` (`@/shared/lib/sportIcons`) for icon+label
  consistency, but **a separate local pill component** (user decision) — do not extract/reuse
  `SportSwitcher`'s `Pill` sub-component, since that one is single-select
  (`aria-pressed`/exclusive-active semantics) and this needs independent multi-select toggle state
  (`Set<SportKey>`), not a shared implementation. No "All" pill as a distinct filter option here —
  instead:
  - **Pre-selection on open:** if `JoinGroupModal` opens with a `lockedSport` context (page's active
    sport tab is a specific sport, e.g. Basketball), only that sport's pill is pre-selected.
  - If the page's active sport context is "All" (`lockedSport === null`), **all of the user's sport
    pills are pre-selected** by default.
  - The user can freely change the selection after opening (toggle pills on/off) before searching.
- **Search gating:** do NOT run any query — including on modal open — while the search input is
  empty. This changes `usePublicGroups.ts:10-13`'s current documented behavior ("an empty keyword
  still returns a browsable list … doesn't gate on a non-empty search term") — flagging this as an
  intentional behavior change per the user's explicit instruction, not an oversight. Confirm at
  pickup this doesn't break `FEED-5`'s original "browse with no query" acceptance criteria the old
  behavior satisfied; if it does, that's an explicit, accepted regression per this ticket, not a bug.
- **Multi-sport search execution (revised per A10):** `usePublicGroups` takes a `sportIds:
  number[] | undefined` param instead of singular `sportId`, sent as the new multi-value query param
  A10 adds to `GET /api/groups/public`. **One request total**, not one per sport — the flat
  `Page<GroupSearchResponse>` result already carries `sportId` per row (confirmed,
  `GroupSearchResponse.java:14`), so the client groups the single response by `sportId` client-side
  for section rendering. No per-section loading/error state needed — one `isLoading`/`isError` pair
  for the whole modal, same shape every other hook in this codebase already returns.
- **Selecting zero sport pills:** allowed (user decision) — Search stays enabled; if the user
  searches with no sport selected, render the results area's empty state (no sections), same
  visual treatment as a real zero-result search rather than a distinct "select a sport" message,
  unless that reads confusingly at pickup.
- **Grouped results:** render results grouped under one section per sport **present in the
  response** (i.e., per distinct `sportId` actually returned, not necessarily every selected pill —
  a selected sport with zero matches produces no rows and thus no section, since there's only one
  combined query/response now, not an independent per-sport call to hang an explicit empty section
  off of). Section order follows the filter pills' order. Each section's header matches its filter
  pill's styling — icon (via `getSportIcon()`) + sport name.

**Design questions — resolved during implementation:**
- Pill styling mirrors `SportSwitcher`'s `Pill` visually (same active-border treatment) via a
  separate `SportFilterPill` component in `JoinGroupModal.tsx` — not shared code, since
  `SportSwitcher`'s `Pill` is single-select.
- A10's `sportIds` binds via **repeated bare keys** (`?sportIds=1&sportIds=2`), confirmed against
  Spring's default `List<Long> @RequestParam` binding. axios's *default* array serialization uses
  bracket notation (`?sportIds[]=1`) instead, which Spring does not bind correctly — fixed via
  `apiClient`'s new `paramsSerializer: { indexes: null }` (global fix, not a per-call workaround).
- Zero-selected-sports keeps the existing "No groups found." copy — no separate
  sport-selection-aware message; reads fine in practice (verified in a live browser walkthrough).

**Out of scope:**
- Changing `CreateGroupModal`'s existing single-sport locked behavior — untouched by this ticket.
- Sports outside the current user's own profiles (e.g. a 4th sport they don't have a profile for) —
  the filter only ever lists the user's own sports, never the full system sport list.

---

### GRP-5 · Join Group modal — show the active sport filter
**Status:** `SUPERSEDED` by GRP-6 (above), 2026-07-21 · **Type:** Enhancement · **Filed:** 2026-07-21,
found while explaining existing behavior (not a bug report — the filter itself works correctly, only
its visibility doesn't)

**Origin:** confirmed via code read (`GroupsPage.tsx`/`useJoinGroupModalData.ts`/`usePublicGroups.ts`)
that `JoinGroupModal`'s search **does** apply the Groups page's active sport filter server-side —
`GroupsPage` computes `lockedSport = activeSport !== 'all' ? activeSport : null` and passes its
`sportId` through `useJoinGroupModalData` into `usePublicGroups`, which sends it as a `GET
/api/groups/public?sportId=...` query param. When `activeSport === 'all'`, no `sportId` is sent and
results span every sport.

**The gap:** `CreateGroupModal` already receives this same `lockedSport` value and visibly shows/locks
the sport in its form — `JoinGroupModal` does not. It has no `lockedSport` prop at all; the filtering
happens silently. A user on, say, the Basketball tab who opens Join Group and doesn't see a football
group they expected has no indication in the modal itself that results are scoped to Basketball —
they'd have to notice the sport tab underneath to infer why.

**What ships:** thread `lockedSport` (already computed in `GroupsPage.tsx`, same value
`CreateGroupModal` already takes) into `JoinGroupModal` and render a visible indicator when it's
non-null — e.g. "Searching in {sport}" near the search input — matching whatever visual treatment
`CreateGroupModal`'s locked-sport display already uses, for consistency rather than inventing a new
pattern.

**Design questions to resolve at pickup:**
- Exact copy/placement — mirror `CreateGroupModal`'s locked-sport UI verbatim, or does the modal's
  layout call for something lighter (e.g. a small badge vs. a full form field, since Join Group has no
  sport dropdown to replace the way Create Group does)?
- Should the indicator be static text, or does it need its own `aria-label`/live-region treatment so
  a screen-reader user searching gets the same "why are results limited" context sighted users would
  infer from the page's sport tab?

**Out of scope:**
- Changing the filtering behavior itself — it already works correctly; this is a visibility-only fix.
- Any change to `CreateGroupModal`'s existing locked-sport display.

---

| Item | Decision |
|---|---|
| De-mock HF-4 (UpcomingMatches) | No longer deferred — the Session/Location backend shipped 2026-07-30 (`modules/session`, `modules/location`, GROUP-RECUR-1). Filed as **CLIENT-LOC-1**/**CLIENT-SESSION-1** (Phase 10, `TODO`), see entries below. |
| Forgot/reset password screens | Deferred — `POST /api/auth/forgot-password` is a non-functional server-side placeholder; building UI against it now would do nothing. |
| OAuth2 social login (Google/Facebook) | Deferred — scaffolded server-side but unverified; own ticket if prioritized. |
| Group invitations / pinned posts / ownership transfer UI | Deferred — real endpoints exist; **GRP-1 is the Groups-page epic's first ticket, but does not itself cover invitations, pinned posts, or ownership transfer** — those remain deferred beyond GRP-1. |
| Add-sport flow screen | Deferred — only the entry-point callback is wired (HF-2/SPORT-1); `POST /api/sports/profiles` is ready when this gets scoped. |
| Group member blacklist/ban | Deferred — no schema, repository query, or endpoint exists for banning/blocking a group member. GRP-3 ships its Blacklist section as a permanent "coming soon" empty state; real functionality needs a backend design pass before a follow-up client ticket. |

---

### CLIENT-LOC-1 · `LocationPicker` component
**Status:** `DONE` (2026-07-31, `client/docs/CLIENT-LOC-1_LOCATIONPICKER_COMPONENT.md`) · **Type:** Feature · **Filed:** 2026-07-30, alongside CLIENT-SESSION-1 once the
Session/Location backend shipped
**Dependency:** `modules/location` LOC-1 (`DONE`) — no client code dependency otherwise; this is a
self-contained component, buildable before CLIENT-SESSION-1 has anywhere to use it (Storybook-testable
standalone, same "components ship ahead of page integration" precedent as Phase 1's HF-1..HF-6).

**What ships:** the shared location-picking widget both session create/edit (CLIENT-SESSION-1) and,
later, group recurrence config will use. Types + `use<Feature>Data`-style hook (`useLocationPickerData`,
composing `useLocationSearch`/`useResolveMapsUrl`/`useCreateLocation`) against the real backend:
- Sport-scoped typeahead search (`GET /api/locations/search?sportId=&q=`) — a `Location` is always
  specific to one sport (LOC-1 decision), so this component always takes a `sportId` prop from
  whatever form opens it.
- "Add a new location" flow with **no paid/keyed map API** (`documentation/md/SESSION_LOCATION_DESIGN.md`
  decision): a "Find on Google Maps" link-out button, a paste-the-share-link-back field wired to
  `POST /api/locations/resolve-maps-url` (coordinates may come back `null` for an unresolvable
  link — not an error, falls back to manual entry), and a free **OpenStreetMap/Leaflet** preview pin
  (draggable, for fine-tuning) once coordinates are known.
- Confirm calls `POST /api/locations` and returns the chosen `Location` to the parent form.
- "Get Directions" link (deep-links to the user's own maps app) once a `Location` has coordinates —
  no in-app routing.

**New dependency, flagged per `client/CLAUDE.md`'s "that's a conversation to have and record, not a
silent per-page exception" rule:** `leaflet` + `react-leaflet`. Must be **`react-leaflet` v4.x, not
v5** — v5 requires React 19, this app is pinned to React 18.3.1. No `Command`/Combobox primitive
exists yet in this codebase for the search-as-you-type input; follow `JoinGroupModal`'s existing
`Input` + custom result-row pattern (submit-triggered search, not live-as-you-type) rather than
introducing a second new dependency (`cmdk`) in the same ticket.

**Explicitly out of scope:** page-level integration (CLIENT-SESSION-1), geo-proximity/nearby search
(no such backend endpoint exists — LOC-1 deliberately didn't build one), editing/moderating an
existing `Location` (LOC-1's backend is create-only).

---

### CLIENT-SESSION-1 · Session create/list/join/leave/cancel UI
**Status:** `DONE` (2026-07-31, `client/docs/CLIENT-SESSION-1_SESSION_UI.md`) · **Type:** Feature · **Filed:** 2026-07-30, alongside CLIENT-LOC-1
**Dependency:** CLIENT-LOC-1 (`DONE`, needed for the location field on create/edit) · backend
`modules/session` SESSION-1/SESSION-2/SESSION-3 (all `DONE`) — full status lifecycle
(`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`) and `POST /api/sessions/{id}/cancel` already exist,
build against that contract directly rather than an earlier hard-delete shape.

**What ships:** de-mocks HF-4's `UpcomingMatches` (`client/docs/HF-4_UPCOMINGMATCHES.md`, currently
`mockData.ts`-backed per the data layer convention) against the real `/api/sessions/**` endpoints —
group-linked (owner/admin-gated) or standalone (open to any user) sessions, using `LocationPicker`
for the required `locationId` field. Types + data hook(s) wrapping create/get/list-by-group/
list-mine/update/cancel/join/leave/participants. Status badges must reflect the real 4-state lifecycle
(including the automatic `ONGOING` transition, not just create-time `SCHEDULED`), and cancelling
must surface `cancelReason` where shown, matching the backend's soft-cancel-only model (there is no
delete endpoint — `SessionServiceImpl` removed it entirely in SESSION-3).

**Explicitly out of scope (may need its own follow-up ticket, not yet filed):** wiring a group's
recurring-session schedule config (`GET`/`PUT /api/groups/{id}/recurrence`, `autoGenerateSessions`
toggle) into the Groups page Settings tab — that's a separate owner-facing surface from the
session list/create/join flow this ticket covers. Also out of scope: an edit-session UI
(`useUpdateSession` hook exists, no UI consumes it — the ticket title only lists create/list/
join/leave/cancel).

**Delta (resolved during implementation, see `client/docs/CLIENT-SESSION-1_SESSION_UI.md` for the
full writeup):** `/matches` already had a real, reserved route (`ComingSoonPage`) and nav tab — this
ticket built the real page there rather than a modal-only flow. The real `Session` has no capacity/
max-participants field, so HF-4's "N spots left, join / Full" CTA has no equivalent — replaced with
a status badge + a single "View details" CTA; join/leave moved into the detail dialog. There is no
batch "sessions across my groups" endpoint and no way to discover a standalone session someone else
created (only `GET /sessions/mine` = caller's own, `GET /sessions/group/{id}` = one group) — a real
backend gap, not solved here, worth its own follow-up ticket if session discovery needs to widen.

### CLIENT-SESSION-2 · Standalone-only `CreateSessionModal` redesign (core fields)
**Status:** `DONE` (2026-08-03) · **Type:** Feature · **Dependency:** none (frontend-only) ·
**Filed:** 2026-08-01 · **Spec:** `client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`

**What shipped:** `CreateSessionModal` drops its standalone/group mode toggle (standalone-only —
group-linked session creation has no UI until the still-unbuilt group recurrence-config settings
surface ships), widens to `max-w-2xl`, and restructures into two collapsible sections styled after
the Friends page rail's own section headers (`FriendSection` — small muted trigger label, chevron
centered next to it, underlined, not a bold heading): "Session basic information" (open by
default) and "Session detail" (collapsed, "Coming soon" placeholder for a later
profile-derived-prefill ticket). Four rows inside the first section (ratios per user decision):
Sport(2)/Title(8); Location(7, selected name + button on one line)/Location note(3); "Starts
at"(7)/Duration(3); Description alone, full width. Sport pre-selects from the hosting page's active
pill, or the caller's sole sport profile, or blank. Required fields (Sport/Title/Location/Starts
at/Duration) show a red `*`; "Create session" is always clickable rather than disabled until
valid — clicking it while invalid sets a per-field error under whichever required fields are still
empty, each clearing on its own the moment that field is filled in.

New shared-within-feature component `SessionStartTimePicker` replaces the old native
`datetime-local` input with three fully independent native `<select>`s (Date/Hour/Minute) —
**not** a Radix Popover-based wheel as originally planned. Nesting Radix floating UI inside this
modal's own Dialog caused two separate confirmed-live bugs during implementation: a `Popover`
stopped opening at all once made to cooperate with the Dialog's focus trap (forcing it `modal`
"fixed" the open bug but caused a stack-overflow from two competing focus traps — reverted), and a
`DropdownMenu`-based location-favorites shell never opened live either, with nothing to show in it
anyway pre-CLIENT-SESSION-5 (reverted to the plain button). Native `<select>`s have no
portal/dismissable-layer involved, so that whole bug class doesn't apply — the Date select offers
Today/Tomorrow/next 5 days/"Pick a date…" (the last revealing a small hand-built inline calendar,
no calendar library exists in this codebase), and defaults to Today/one-hour-from-now/:00 on open
rather than starting blank.

**Why the original plan (favorites dropdown shell, Popover wheel) changed:** both were designed
before implementation surfaced that Radix floating UI doesn't reliably nest inside this specific
modal's Dialog in this app's current Radix versions — confirmed live twice, not a jsdom-only
artifact. Favor simple, proven primitives (native `<select>`, plain `Button`) over a broken shell
for either don't-yet-exist data (favorites) or a "nicer" picker.

**Delta (2026-08-03, at pickup):** the backends for four originally-excluded fields
(SESSION-4/5/6, LOC-2 — capacity/fee, invite/auto-approve, favorites, discover) shipped
2026-08-01/02, after this ticket was originally filed. Rather than re-scope this already-reviewed
ticket mid-flight or fold everything into one oversized PR, those four areas are filed as their
own tickets (CLIENT-SESSION-3/4/5/6, below), each depending on this one.

**Delta (2026-08-03, at close-out):** this ticket's original scope also included Point 1 —
`UpcomingMatches`'s empty-state rail CTAs ("Create your match"/"Join a match") and extracting the
create-session hook out of `useMatchesPageData` so Home Feed/Groups/Friends/Matches share one
modal instance. That work wasn't started this session (user decision: build the modal redesign —
Point 2 — first, then close out what was actually done rather than leave an unstarted part
blocking the rest) — split into its own ticket, **CLIENT-SESSION-7**, below.

### CLIENT-SESSION-7 · Upcoming rail create/join CTAs + create-session hook extraction across pages
**Status:** `DONE` (2026-08-06) · **Type:** Feature · **Dependency:** CLIENT-SESSION-2 (`DONE` —
the hook this ticket extracts wraps that modal), CLIENT-SESSION-6 (`DONE` — Discover is real) ·
**Filed:** 2026-08-03, split from CLIENT-SESSION-2's original scope at close-out · **Spec:**
`client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` § "Point 1" · **Summary:**
`client/docs/CLIENT-SESSION-7_RAIL_CTAS_AND_HOOK_EXTRACTION.md`

**What shipped:** `UpcomingMatches`'s empty state drops "for this sport" from its copy and gains
two controlled CTAs — "Create a match" (opens `CreateSessionModal`, its data hook extracted out
of `useMatchesPageData` into standalone `useCreateSessionModalData` so
`HomeFeedPage`/`GroupsPage`/`FriendsPage`/`MatchesPage` share one create-session implementation)
and "Join a match". `FriendsPage` gained `ModalAnchorProvider`, anchored to its own `sr-only`
`<h1>` (no pill row to anchor to instead).

**Delta (2026-08-06, at pickup):** "Join a match" was originally specced as `navigate('/matches')`
("superseded once CLIENT-SESSION-6 ships a real discover destination" — it since has). Asked
directly at pickup whether it should navigate there or open a dedicated modal instead — chose the
modal. Real scope growth as a result: a new `SessionDiscoverModal` + `SessionDiscoverPanel` (the
latter extracted out of `MatchesPage`'s inline Discover JSX so the modal and the full page share
one implementation) + `useDiscoverModalData`, none of which were in the original ticket. See the
summary doc for the full design and the resulting no-e2e-coverage divergence (existing e2e
fixtures never reach `UpcomingMatches`'s empty-state branch — covered via Vitest instead).

### CLIENT-SESSION-3 · Capacity + fee/pricing fields in `CreateSessionModal`
**Status:** `DONE` (2026-08-03) · **Type:** Feature · **Dependency:** CLIENT-SESSION-2 (extends its
"Session basic information" section) · **Filed:** 2026-08-03 · **Spec:**
`CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` § "Fields explicitly excluded" (original draft
requirements), backend contract: `modules/session/docs/SESSION-5_CAPACITY_AND_FEE.md` · **Summary:**
`client/docs/CLIENT-SESSION-3_CAPACITY_AND_FEE.md`

**What ships:** "Taken slot"/"Open slot" numeric inputs (1–24 in the UI; backend accepts any `>= 0`
int, no upper cap — `capacity` is informational/display-only, never enforced by `joinSession`) and a
"Fee" input group — mutually exclusive "Free" / "Split cost" / a fixed VND amount, mapping to
`feeType` (`FREE`/`SPLIT`/`FIXED`) and `feeAmountVnd` (required, and only meaningful, when
`feeType=FIXED`). Both `capacity` and `feeType` are **mandatory** on `CreateSessionRequest` — no
default fallback, the form must require both before submit. Also displays capacity/fee on
`SessionListCard`/`UpcomingMatches`/`SessionDetailModal` (read side, currently missing entirely).

**Delta (2026-08-03, at close-out):** "Taken slot"/"Open slot" turned out to be literal — two
separate inputs summed into the single backend `capacity` field at submit time, not one field with
that phrasing as a description. "Taken slot" means the creator (and whoever's already with them) —
it defaults to **1**, not 0, when left blank, since the creator always auto-joins; a live
`"{taken}/{capacity} slots"` summary renders under the two inputs. Fee shipped as a checkbox each
for Free/Split cost plus a label+number-input for Fixed amount (not a button/select group) —
typing into the amount field selects `FIXED`. The Fixed-amount field additionally formats a
thousand-space separator while typing, and every numeric field in the form rejects non-digit
keystrokes/pastes at the DOM event level. `SessionListCard`'s session-type/group-name row was
removed (user decision, unrelated to the backend contract) — `SessionDetailModal`'s own
"Standalone"/"Group session" badge is untouched. See the summary doc's "Implementation notes" for
the full before/after — the backend contract itself never changed.

### CLIENT-SESSION-4 · Invite-friends + auto-approve at creation, plus approval queue UI
**Status:** `DONE` (2026-08-04) · **Type:** Feature · **Dependency:** CLIENT-SESSION-2 (extends its
"Session basic information" section), FRIEND-1 (`useFriends()`, already `DONE`) · **Filed:**
2026-08-03 · **Spec:** `CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` § "Fields explicitly
excluded" (original draft requirements), backend contract:
`modules/session/docs/SESSION-6_JOIN_APPROVAL_AND_INVITES.md` · **Summary:**
`client/docs/CLIENT-SESSION-4_INVITE_APPROVAL.md`

**What ships:** an "Invite your friend" search-and-multi-select (client-side fullname filter, 3+
characters, over `useFriends()`'s existing full unpaginated list — no new search endpoint needed)
with dismissible badges, feeding `CreateSessionRequest.inviteeIds`; an "Auto approve join request"
checkbox (default **unchecked**, matching the backend's new-session default) with a confirm/warning
dialog on check ("everyone can join without your review"), feeding `autoApprove`. Also builds the
approval queue: creators/owner-admins can list `REQUESTED` participants (`GET
.../participants?status=REQUESTED`) and approve/reject them (optional reject reason), most likely
surfaced in `SessionDetailModal` mirroring the Groups page's Members-tab approval queue pattern —
without this, auto-approve-off sessions have no way to actually approve anyone through the app.

**Delta (2026-08-04, at close-out):** the "confirm/warning dialog on check" wording above was
built as an inline warning line under the checkbox instead of an actual dialog — no separate
confirm step, and no nested Dialog/Popover of any kind. `CreateSessionModal` had already broken
twice from nesting a Radix `Popover`/`DropdownMenu` inside its own already-open modal `Dialog`
(CLIENT-SESSION-2's favorites-dropdown and wheel-picker reverts — both are separate-portal,
separate-focus-trap primitives that fight the outer Dialog's own trap). The approval queue's
"Waiting for approval" section also gates on `canJoinOrLeave` (SCHEDULED/ONGOING), not just
non-empty — the backend rejects approve/reject once a session is `CANCELLED`, so this avoids
showing buttons that would only ever 400.

### CLIENT-SESSION-5 · Favorite locations — heart-toggle + `CreateSessionModal` favorites dropdown
**Status:** `DONE` (2026-08-04) · **Type:** Feature · **Dependency:** CLIENT-SESSION-2 (the location
field it populates), CLIENT-LOC-1 (`LocationPicker`, already `DONE`) · **Filed:** 2026-08-03 ·
**Spec:** `CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` § "Fields explicitly excluded"
(original draft requirements), backend contract:
`modules/location/location-impl/docs/LOC-2_FAVORITE_LOCATIONS.md` · **Summary:**
`client/docs/CLIENT-SESSION-5_FAVORITE_LOCATIONS.md`

**What ships:** a favorite-toggle heart on `LocationPicker`'s search-result rows, wired to the real
favorite-locations backend, plus turning `CreateSessionModal`'s plain "Choose a location" button
into a real favorites-aware dropdown for the effective sport (a `DropdownMenu`-based shell was
tried during CLIENT-SESSION-2 and reverted — confirmed live, it never opened at all nested inside
that modal's Dialog — so this ticket needs to solve that nesting problem for real, not just wire
data into an already-built shell), with a trailing "Choose a location" entry still opening the
unchanged `LocationPicker` flow.

**Delta (2026-08-04, at close-out):** the nesting problem *was* solved for real, and the actual
cause was different from what CLIENT-SESSION-2's note implied. It's not a focus-trap conflict —
Dialog and DropdownMenu share the same internal Radix package versions in this repo and already
coordinate correctly. The real cause: `DropdownMenu`'s default `modal={true}` calls the same
`hideOthers()`/`aria-hidden` mechanism the outer `Dialog` itself uses, and since the menu's portal
is a DOM sibling of the Dialog's (not a descendant), opening it aria-hid the *entire parent
Dialog* — confirmed directly via live DOM inspection (`data-aria-hidden="true"` appeared on the
dialog the instant the menu opened). Fix: `modal={false}` on the nested menu only. Also found and
fixed, not originally scoped: `shared/ui/button.tsx`'s `Button` was missing `React.forwardRef`
(broke `asChild` ref composition for any Radix trigger wrapping it, app-wide — every other
`DropdownMenuTrigger` in the codebase happened to wrap a plain `<button>` instead), and an MSW
mock-only route-ordering bug where `GET /api/locations/:locationId` intercepted
`GET /api/locations/favorites` before it, causing a stuck "Loading…" in e2e.

### CLIENT-SESSION-6 · Standalone session discover — real "Join a match" browse UI
**Status:** `DONE` (2026-08-05) · **Type:** Feature · **Dependency:** CLIENT-SESSION-1 (`DONE` — the
`/matches` page this ticket rebuilds) · **Filed:** 2026-08-03 · **Spec:** backend contract:
`modules/session/docs/SESSION-4_STANDALONE_DISCOVERY.md` · **Summary:**
`client/docs/CLIENT-SESSION-6_STANDALONE_DISCOVERY.md`

**What ships:** `/matches` rebuilt into two panels: a **Discover** grid (`GET /api/sessions/discover`,
optional `sportId` filter tied to the sport switcher, client-side search-by-title/location) and a
collapsible, calendar-day-grouped **"My sessions"** panel (everything the caller created, manages via
a group, or has joined — any status, one merged list, not split into separate upcoming/history
sections).

**Delta (2026-08-05, at pickup):** this ticket's original dependency note ("CLIENT-SESSION-2 — the
`onJoinMatch` prop it introduces") was stale — that prop doesn't exist; it's CLIENT-SESSION-7 scope
(still `TODO`), corrected here to depend on CLIENT-SESSION-1 instead. Repointing
`UpcomingMatches`'s rail CTA at this new Discover surface remains CLIENT-SESSION-7's job, not this
ticket's — there was no rail entry point to repoint yet at pickup. The "modal or dedicated view, TBD
at design time" open question was resolved by a user-provided design export (a two-panel layout, not
either original option) rather than a fresh design pass — see the summary doc.

**Delta (2026-08-05, at close-out):** `GET /api/sessions/joined`'s `status` param — required at
SESSION-4 ship time, with an explicit "add an all-statuses mode if a real caller needs it" note — is
now optional. The "My sessions" panel needed the caller's whole joined set in one date-grouped list;
omitting `status` returns every `SessionStatus` in one page instead of a 4-call fan-out. Backward
compatible, see `modules/session/docs/SESSION-4_STANDALONE_DISCOVERY.md`'s own delta note.

### SPORT-2 · Static per-sport attribute config + `SportAttributesFields` component
**Status:** `TODO` · **Type:** Component · **Dependency:** none · **Filed:** 2026-08-01 · **Spec:**
`client/docs/SPORT-2_SPORT_ATTRIBUTE_CONFIG.md`

**What ships:** closes a gap backend ticket A3 (`modules/sport/sport-impl`, `DONE`) explicitly left
open — `UserSportProfile.attributes` is a schema-less JSONB map by design (no backend schema table,
a deliberate A3 decision), with "which keys render for which sport" assigned to a static
frontend-side config. `shared/lib/sportAttributeConfig.ts` (sibling to the already-shipped
`sportProfileConfig.ts`, which already followed this exact precedent for label/icon/colorRamp) adds
`SPORT_ATTRIBUTE_CONFIG: Record<SportKey, SportAttributeField[]>`; `shared/components/
SportAttributesFields.tsx` renders it (text/select inputs, controlled, same idiom `AddSportModal`
already uses; renders nothing for a sport with an empty field list). No backend change — A3 already
ships everything this needs.

**Explicitly out of scope:** no page hosts this component yet. `AddSportModal` already deferred
`bio`/`preferredPosition` to "a future profile-editing screen" that was never filed; `attributes`
joins that same deferred list. This ticket only removes the "component doesn't exist yet" blocker,
same "component ships ahead of the page" precedent `LocationPicker` set for `CreateSessionModal`.

### CLIENT-SESSION-8 · Session comments — discussion section in Session Detail modal
**Status:** `TODO` · **Type:** Feature · **Dependency:** SESSION-10
(`modules/session/docs/BACKLOG_MVP.md`, backend, `TODO`) · **Filed:** 2026-08-07 · **Spec:**
`documentation/md/vision/SESSION_COMMENTS_VISION.md` (vision session — full ticket spec via
`/feature` at pickup)

**What ships:** a comment section rendered below the existing session details in
`SessionDetailModal`, for participant discussion. Visible only when the caller has a
`JOINED`/`REQUESTED`/`INVITED` row on that session (SESSION-10's gate) — absent entirely for a
non-participant viewing a session from Discover. List + post + delete-own-comment, one-level reply
nesting and per-comment likes, same UI idiom as Post's `CommentSection` (not a new pattern). Data
hook refetches on modal open (TanStack Query), no live/websocket updates. Renders identically for
standalone and group-linked sessions — no conditional on `groupId`.

**Explicitly out of scope:** live updates, new-comment notifications, moderation UI for
creator/owner, locking the thread on cancellation — see SESSION-10's own out-of-scope list, same
source of truth.

### SPORT-3 · Sport catalog — fetch the real `GET /api/sports` list instead of the hardcoded 3-sport config
**Status:** `DONE` (2026-08-07) · **Type:** Data layer (real integration) · **Dependency:** soft — **A6**
(`modules/sport/sport-impl/docs/BACKLOG_MVP.md`, `DONE`) · **Filed:** 2026-08-07 · **Summary:**
`client/docs/SPORT-3_SPORT_CATALOG_REAL_FETCH.md`

**Problem, verified against the actual code (not assumed):** despite SPORT-1's ticket text listing
`GET /api/sports` as an endpoint it would use "for icon/name lookup," nothing in the client actually
calls it — confirmed via a repo-wide grep for the endpoint path. The entire "which sports exist" /
label / icon / color-ramp catalog is `shared/lib/sportProfileConfig.ts`'s hardcoded
`SPORT_PROFILE_CONFIG`/`ALL_SPORT_KEYS` (`['football', 'basketball', 'tennis']`) plus
`features/feed/sportIdMap.ts`'s hand-maintained `SPORT_ID_BY_KEY` (`{ football: 5, basketball: 6,
tennis: 2 }`). Every "add a sport" flow (`AddSportModal`/`AddSportFields`, `CreateSessionModal`,
`SessionDiscoverModal`, the Home Feed / Groups / Matches / Friends page rails) reads from these two
static files, not the server. **This means the client cannot show Badminton or Pickleball at all
today** — neither is in `SportKey`, `SPORT_PROFILE_CONFIG`, or `SPORT_ID_BY_KEY` — which becomes a
hard blocker once **A6** deactivates every other sport server-side, since the client's entire
hardcoded catalog will then reference only inactive sports.

**What ships:**
- A real data hook (`useSportCatalog()` or similar, TanStack Query) wrapping `GET /api/sports` — the
  endpoint is already active-only server-side (`SportServiceImpl.getAllActiveSports()`), so no
  client-side `isActive` filtering is needed; whatever the endpoint returns is the full "sports a
  user can pick" list.
- The catalog becomes the single source of truth for which sports the "Add sport" flow, session
  creation/discovery, and every page-level `availableSports` computation can offer — not a
  hand-maintained array that silently drifts from what the backend actually serves (exactly the
  drift this ticket exists to fix).
- Label/icon/color-ramp stay a **static client-side config** (same precedent as A3/SPORT-2 for
  attributes) keyed by something stable from the server response (`sport.id` or `sport.name`) — this
  part is presentational and doesn't need to come from the backend. What changes is *which sports
  exist and are offered*, not how each one is styled once known.

**Open question for implementer (flag before designing, don't decide silently):** `SportKey` is
currently a hand-written string-literal union threaded through most of `src/features/` and
`src/shared/` (ramp lookups, ids, component prop types, ~40+ call sites per the grep that surfaced
this ticket). Two directions, both viable:
1. **Keep `SportKey` as a literal union**, but generate/validate it against the live catalog at
   startup (extend the union by hand each time a sport is added/removed, same as today, just backed
   by a real fetch instead of a guess) — smaller diff, keeps strong typing on every existing call
   site, but doesn't fully remove the "hardcoded set that can drift from the server" problem, just
   narrows it to a manual sync step.
2. **Derive sport identity from `sportId: number` end-to-end**, dropping the `SportKey` string-literal
   layer and `sportIdMap.ts` entirely, with label/icon/ramp keyed by `sportId` instead — removes the
   drift risk completely, but touches every component currently typed against `SportKey` (a much
   larger diff, and the "Sport color ramps" table in `client/CLAUDE.md` would need rewriting since it
   currently names ramps by sport rather than by id).

Given A6 leaves exactly 2 active sports (Badminton, Pickleball — both currently entirely absent from
the client), either direction requires touching `SPORT_PROFILE_CONFIG` regardless; the open question
is only about how much of the existing `SportKey`-typed surface gets touched along with it. Resolve
in Phase 1/3 of `/workon`, not assumed here.

**Out of scope:** re-theming existing sports' ramps (football/basketball/tennis keep their current
teal/coral/purple assignment wherever they remain referenced); any change to `SportServiceImpl` or
other backend behavior (A6 owns the backend side).

**Delta (2026-08-07, at implementation):** the open `SportKey` question resolved to **option
2 — `SportKey = string`**, derived from the live catalog at runtime (`key = sport.name.toLowerCase()`),
not a hand-extended literal union. The "re-theming out of scope" line above held for football/
basketball/tennis's *specific* colors, but those three sports were dropped from
`SPORT_PROFILE_CONFIG` entirely (not kept as dormant entries) since the live catalog can no longer
reach them — a new `getSportProfileConfig()` fallback covers any sport with no bespoke entry instead
of leaving a hole. Scope grew significantly beyond the original description at pickup (user
decision, full cost surfaced explicitly before proceeding): every production call site was migrated
in this same ticket (not split into a follow-up), and the entire MSW/e2e fixture graph
(`e2e/mocks/fixtures.ts`, `paginatedFeedFixture.ts`, 10 spec files, `E2E_OVERVIEW.md`) was reshaped
from the old football/basketball/tennis universe to the real 2-sport one. A genuine race condition
(not anticipated in the original design) was found and fixed along the way — see the summary doc's
"Non-obvious constraints" section.
