# Client — Feature Backlog (SportHub rebuild)

**Version:** MVP v1  
**Module:** `client` (new SportHub app — the existing CRA app in this folder is being dropped and rebuilt, see `client/CLAUDE.md`)  
**Last updated:** 2026-09-04

---

## How to use this file

- Pick the first row in **Open** below — that's the pick-up queue, same as before
- Mark it `IN PROGRESS` at the start of the session (edit the row's Status cell)
- Mark it `DONE` when implementation + tests are complete, and move its row down into **Done**
- Use `/workon client mvp` to resume

**Restructured 2026-08-18** (was previously one ~3,260-line file with full ticket write-ups inline —
reading it to find/update one ticket was costing ~100K tokens per pickup, hitting the read-truncation
cap): this file is now just the index — one thin row per ticket, Open (curated order) above Done
(sorted by completion date, most recent first). Every ticket's full detail (design, what was built,
key decisions, verification, and any "Deltas for later tickets" notes) now lives in its own file
under `client/docs/MVP/`, linked from the Ticket column. Nothing was deleted — every ticket's original
write-up was moved verbatim, either appended to its existing `client/docs/<ID>_<...>.md` summary doc
(now relocated into `MVP/`) or, for tickets that only ever had an inline entry, given a new file.

Full original ticket *specs* (not the delta/build notes above) still live in the two epic docs in
this folder, per the original convention — this backlog (and now `MVP/`) is the queue plus
corrections found along the way (see "Reality check" below):

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

### Open (TODO / IN PROGRESS)

Curated dependency/priority order — same "pick the first row" mechanic `/workon` has always used.
New tickets get inserted at the appropriate position when filed, same as before this restructuring.

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [ACCOUNT-1](MVP/ACCOUNT-1_ACCOUNT_SETTINGS_MODAL.md) | Account Settings modal, triggered from `TopBar`'s avatar dropdown — split out of `/profile` scoping (visibility/toggles/log out don't belong on that page); independent of every `PROFILE-*` ticket | `TODO` |
| 2 | [SPORT-6](MVP/SPORT-6_REFERENCE_FIELD_WIDGET.md) | Reference field widget — search/link/free-text combobox for `Reference`-shaped attributes (rackets, footwear); the one v2 field type needing real interaction rather than a form control — **moved to last in queue 2026-08-26 (user decision)**: hard-blocked on backend A14, which was postponed 2026-08-25 pending aggregation-strategy design work | `TODO` |
| 3 | [PROFILE-12](MVP/PROFILE-12_HEADER_LOADING_ERROR_PLACEHOLDER.md) | ProfileHeader shows a placeholder instead of blank space while `/profile`'s profile query is loading or errors — found during backend U11's rollout, when a stale backend made the header vanish entirely | `TODO` |
| 4 | [GRP-11](MVP/GRP-11_GROUP_COVER_BANNER_PENDING_SELECTION_PLACEHOLDER.md) | `GroupCoverBanner` shows a placeholder instead of the discovery panel while a cross-page-navigated group selection is still loading — found alongside `PROFILE-12` | `TODO` |
| 5 | [CLIENT-SESSION-14](MVP/CLIENT-SESSION-14_SESSION_ATTRIBUTE_SCHEMA_HOOK.md) | `useSessionAttributeSchema` hook + `SessionResponse.attributes` type — scaffolding for session-attribute UI | `TODO` |
| 6 | [CLIENT-SESSION-15](MVP/CLIENT-SESSION-15_SESSION_ATTRIBUTES_IN_CREATE_MODAL.md) | Session attributes in `CreateSessionModal`, pre-filled from the creator's sport profile (`#ref` nodes only) | `TODO` |
| 7 | [CLIENT-SESSION-16](MVP/CLIENT-SESSION-16_SESSION_ATTRIBUTES_READ_ONLY_IN_DETAIL_MODAL.md) | Read-only session attributes (term/value, not disabled inputs) in `SessionDetailModal` | `TODO` |
| 8 | [ADMIN-5](MVP/ADMIN-5_SESSION_ATTRIBUTE_SCHEMA_EDITOR.md) | Session attribute schema editor — second JSON textarea in the sport admin page (ADMIN-2 pattern) | `TODO` |
| 9 | [SPORT-7](MVP/SPORT-7_ATTRIBUTE_FIELDS_ORDER_AND_LAYOUT.md) | `SportAttributesFields` — honor `order`, group-level layout (collapsible + responsive grid); helps the profile editor too | `TODO` |
| 10 | [SPORT-8](MVP/SPORT-8_REMOVE_PREFERRED_POSITION_FROM_PROFILE_EDITOR.md) | Remove "Preferred position" from the sport profile editor — client half of backend A18 | `TODO` |
| 11 | [SPORT-9](MVP/SPORT-9_NUMBER_AND_BOOLEAN_ATTRIBUTE_CONTROLS.md) | `NUMBER` (number input, honors `min`/`max`) and `BOOLEAN` (checkbox) form controls in `SportAttributesFields` + `DefinitionFields`; mirror the enum + resolved `min`/`max` in `shared/types/sport.ts` — client half of backend A16 (`DONE` 2026-09-02); renderer currently `default: return null`-degrades both | `TODO` |

**`/profile` page design:** `client/docs/PROFILE_PAGE_DESIGN.md` — full scoping rationale for
`PROFILE-0`..`PROFILE-9` and why `ACCOUNT-1` was split out, from a `/feature` session against
`client/design-reference/design-reference-profile.html` (2026-08-26). `PROFILE-4` hard-depends on
`SPORT-2`; `PROFILE-6` depends on `PROFILE-1/2/3/4/5`; `PROFILE-7`/`PROFILE-8` depend on `PROFILE-6`;
`PROFILE-9` depends on everything above it. `ACCOUNT-1` has no dependency on any `PROFILE-*` ticket.

**PROFILE-10 (new, filed 2026-08-27, `/ticket` session)** — six independent gaps/polish items found
using the shipped `/profile` page (`PROFILE-6`), bundled into one ticket rather than six. No
dependency on `PROFILE-7`/`8`/`9` in either direction; **inserted ahead of `PROFILE-7` in queue order
(user decision)** rather than appended — a queue-position choice, not a code dependency. Item 4 (post
composer unsaved-changes guard) reaches beyond `/profile` — `CreatePostForm` is also mounted on Home
Feed and Groups — bundled here anyway (user decision) since the natural fix lives in `CreatePostForm`
itself. Item 2 (shoe-size bound) includes a small `modules/user/user-impl` backend touch (one bound
value + one message string, no schema change) folded directly into this ticket rather than filed
separately (user decision: too small to warrant its own ticket).

**PROFILE-9 done 2026-08-27** — first live-browser QA pass against a real running backend for
`/profile` (every prior `PROFILE-*` ticket had noted no browser session was available). All checklist
areas pass; found one trivial duplicate-React-key console warning (`EditProfileModal`/`AddSportModal`
both keyed from a counter starting at `0`, same bug class `FEED-9` already fixed in `GroupsPage.tsx`)
— filed as **PROFILE-11** rather than fixed inline, per this ticket's own "verification only" scope.
Full results: `client/docs/MVP/PROFILE-9_QA_ACCEPTANCE_CHECKLIST.md`.

**PROFILE-11 done 2026-08-28** (user decision: bundled into the same PR as `PROFILE-9` rather than
picked up separately) — namespaced both keys (`` `edit-profile-${count}` ``/`` `add-sport-${count}` ``).
An attempted committed Vitest regression test (console-error spy) turned out not to actually catch the
bug in this test environment — discovered by deliberately reverting the fix and re-running the test in
isolation, which still passed; removed rather than shipped as false confidence. Verified instead via a
live browser before/after console check, same evidence class `FEED-9`'s original analogous fix used.

**ADMIN-2 needs no new ticket for v2.** It shipped as a JSON textarea over the raw document by
explicit choice, so it keeps working unchanged — the admin simply pastes a richer document. The
`searchScope` picker discussed in the v2 design is an ADMIN-3-class enhancement, and ADMIN-3 is
already deferred to V1.

**ADMIN-3 deferred to V1 on 2026-08-21** (user decision, during its own `/workon` pickup) — the
attribute-schema JSON-editor upgrade. Moved to `client/docs/BACKLOG_V1.md`, which carries the full
entry plus the dependency research done at pickup. The textarea ADMIN-2 shipped keeps serving the
schema editor in the meantime, unchanged.

### Done

Sorted by completion date, most recent first — a changelog, not a pick-up queue. Full detail for
every ticket (design, what was built, key decisions, verification) lives in its own file under
`client/docs/MVP/`, linked from the Ticket column.

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SPORT-10](MVP/SPORT-10_ADD_SPORT_RESUME_REACTIVATION_FLOW.md) | Add-sport resume/reactivation flow — `useResumableSports()` reads `GET /sports/profiles?includeInactive=true`; a soft-deleted sport selected in the picker shows read-only prior skill/YoE + **Reactivate** (`POST {sportId, isResume:true}`) + **Cancel**; Profile-page `SportSwitcher` also shows deactivated sports as muted pills that open that flow. Client half of backend **A20** | `DONE` (2026-09-04) |
| 2 | [SPORT-11](MVP/SPORT-11_CALLER_SCOPED_SPORT_PROFILE_READS.md) | Move sport-profile reads to the caller-scoped endpoints — self read repointed `GET /sports/profiles/user/{id}` → `GET /sports/profiles` (A22), single `['sportProfiles','me']` cache key; friend-profile sport pills rewired onto `UserInfoResponse.activeSportIds` (backend **U15**), `useUserInfo` now runs for every selection. Client half of backend **A20** owner-only gate + **A22** path change | `DONE` (2026-09-04) |
| 3 | [FRIEND-2](MVP/FRIEND-2_DEDICATED_FRIEND_PROFILE_HOOK.md) | Dedicated friend-profile hook — replaced the borrowed `features/profile/useUserProfile` with a Friends-owned `useUserInfo` on `GET /api/users/{userId}`, typed 1:1 with U11's `UserInfoResponse` (incl. `username`); deleted the old hook (zero importers), fixed stale doc comments — **backend U14 resolved to no change**. **+ scope change same session:** `FriendProfilePanel`'s `FRIENDS` state gained a `Friend ▾` menu → `Unfriend` → confirm dialog → `DELETE /api/users/friends/{id}` (closes a FRIEND-1 gap) | `DONE` (2026-08-29) |
| 4 | [CLIENT-NOTIF-5](MVP/CLIENT-NOTIF-5_NOTIFICATION_TEXT_FOR_FRIEND_REQUEST_TYPES.md) | Notification text + `/friends` navigation for `user.friend_request.created` / `.accepted` (U13) — union members + `getNotificationText` cases + the one notification type that navigates; pre-selects the requester (or shows an "unavailable" dialog if the request/account is gone) | `DONE` (2026-08-29) |
| 5 | [PROFILE-11](MVP/PROFILE-11_DUPLICATE_MODAL_KEY_ON_PROFILEPAGE.md) | Duplicate React key on `ProfilePage`'s `EditProfileModal`/`AddSportModal` (both keyed by a counter starting at `0`) — found during `PROFILE-9`'s QA pass, same bug class `FEED-9` already fixed in `GroupsPage.tsx`; fixed and live-verified same session | `DONE` |
| 6 | [PROFILE-9](MVP/PROFILE-9_QA_ACCEPTANCE_CHECKLIST.md) | `/profile` page — QA / acceptance checklist — first live-browser pass against a real backend for this page; found/filed one trivial duplicate-React-key bug (`PROFILE-11`) rather than fixing inline | `DONE` |
| 7 | [PROFILE-8](MVP/PROFILE-8_E2E_PROFILE_JOURNEY.md) | `/profile` page — E2E functional test, profile journey — found/fixed two more real MSW mutation gaps (PUT handlers for sport profile + user profile) | `DONE` |
| 8 | [PROFILE-7](MVP/PROFILE-7_RESPONSIVE_A11Y_VISUAL_REGRESSION.md) | `/profile` page — responsive + accessibility + visual regression against `design-reference-profile.html` — found/fixed a real MSW test-infra gap, a nested-`<main>` landmark bug, and a composer overflow bug also reachable on the Groups page | `DONE` |
| 9 | [PROFILE-10](MVP/PROFILE-10_PROFILE_PAGE_ENHANCEMENTS.md) | `/profile` page enhancements — sport badge, edit-modal bound, unsaved-changes guards, bio styling, SportSwitcher hover | `DONE` |
| 10 | [PROFILE-6](MVP/PROFILE-6_PROFILE_PAGE_INTEGRATION.md) | `/profile` page — `ProfilePage` integration (layout, tab wiring, right-rail reuse, route swap) | `DONE` |
| 11 | [PROFILE-4](MVP/PROFILE-4_SETTINGS_TAB_SPORT_PROFILE_EDITOR.md) | `/profile` page — Settings tab, per-sport profile editor (skillLevel/experience/position + SPORT-2's `SportAttributesFields`) — widened at pickup to also drop `all` from the whole page (PROFILE-2 retrofit) | `DONE` |
| 12 | [PROFILE-5](MVP/PROFILE-5_EDIT_PROFILE_MODAL.md) | `/profile` page — Edit Profile modal (all 14 non-sport-profile `UpdateProfileRequest` fields — widened at pickup, user decision, from the original 8) | `DONE` |
| 13 | [PROFILE-3](MVP/PROFILE-3_MEMORIES_TAB_PLACEHOLDER.md) | `/profile` page — Memories tab renders `ComingSoonPage` (no backend concept exists for it) | `DONE` |
| 14 | [PROFILE-2](MVP/PROFILE-2_POSTS_TAB.md) | `/profile` page — Posts tab (composer + own posts, fully real, reuses `CreatePostForm`/`CommentSection`) — found and fixed a cache-key gap (like/unlike/delete/create were invisible to this tab) and a backend leak (`GROUP_SYSTEM`/`SESSION_POST` rows in `/posts/mine`) along the way | `DONE` |
| 15 | [PROFILE-1](MVP/PROFILE-1_PROFILE_HEADER.md) | `/profile` page — `ProfileHeader` component (cover, avatar, name/handle/city, bio, Edit profile button) — matched `GroupCoverBanner`/`FriendProfilePanel`'s existing cover-fallback precedent rather than inventing a new decorative pattern (user decision) | `DONE` |
| 16 | [PROFILE-0](MVP/PROFILE-0_TYPES_AND_HOOKS_SCAFFOLD.md) | `/profile` page — types + data hooks scaffold (`useMyProfile`, raw sport-profile hook, `useMyPosts`, `profilePageStore`) — found and fixed a real backend gap (`UserResponse` never mapped `city`/`country`) along the way, filed **U14**/**FRIEND-2** follow-ups | `DONE` |
| 17 | [SPORT-2](MVP/SPORT-2_SPORT_ATTRIBUTE_CONFIG.md) | Render a user's per-sport attribute fields on their sport profile (v2: nested records, repeating lists, localized labels) - user-facing half of A9 (ADMIN-2 is the admin half); no page hosts it yet, PROFILE-4 will | `DONE` |
| 18 | [SPORT-5](MVP/SPORT-5_REFRESH_THE_SPORT_CATALOG_ON_ADD_SPORT_AND_SPEAK_UP_WHEN_THERE_IS_NOTHING_TO_ADD.md) | Re-read the sport catalogue when "Add sport" is clicked, and open a dialog when there is nothing to add — **reverses HF-2's aria-disabled pill**; found at pickup that the cap *is* the catalogue size, so the two "empty" states were always one | `DONE` |
| 19 | [CLIENT-MODAL-1](MVP/CLIENT-MODAL-1_STALE_MUTATION_ERROR_ON_MODAL_REOPEN.md) | Stale mutation error survives modal close/reopen — audited all 10 candidate dialogs; 8 leaked (mutation-derived errors) and 2 were cleared (query-derived). Includes `SessionDetailModal` attributing a failed join to the *next* session opened | `DONE` |
| 20 | [ADMIN-4](MVP/ADMIN-4_LOG_OUT_FROM_THE_ADMIN_AREA.md) | Log out from the admin area — `ADMIN-1` put `/admin` outside `AppShell`, so it had no session exit at all; **widened at filing** to include the unsaved-changes guard the admin forms never got | `DONE` |
| 21 | [ADMIN-2](MVP/ADMIN-2_SPORT_ADMIN_MASTER_DETAIL_PAGE.md) | Sport admin master-detail page — table of all sports + side-panel form editing sport fields and the A9 attribute schema — **unblocked 2026-08-21** (backend A9 merged 2026-08-20 PR #176, ADMIN-1 shipped the `/admin` shell), **rescoped the same day** from attribute-schema-only to also cover sport-field updates (SPORT-2 remains the user-facing half of A9) | `DONE` |
| 22 | [ADMIN-1](MVP/ADMIN-1_ADMIN_AREA_ROUTE_AND_GUARD.md) | `/admin` area — route, ADMIN role guard, and shell — first use of `ProtectedRoute`'s `requiredRole` prop; also the e2e suite's first authorization coverage | `DONE` |
| 23 | [CLIENT-NOTIF-4](MVP/CLIENT-NOTIF-4_NOTIFICATION_TYPE_COVERAGE_GUARD.md) | Guard against a backend routing key shipping without its client text case | `DONE` |
| 24 | [CLIENT-SESSION-13](MVP/CLIENT-SESSION-13_SYSTEM_COMMENTS_IN_SESSION_THREAD.md) | Render system comments in the session discussion thread | `DONE` |
| 25 | [CLIENT-NOTIF-3](MVP/CLIENT-NOTIF-3_NOTIFICATION_TEXT_FOR_MISSING_SESSION_TYPES.md) | Notification text for `session.status.started` and `session.participant.left` | `DONE` |
| 26 | [CLIENT-NOTIF-2](MVP/CLIENT-NOTIF-2_NOTIFICATION_BELL_VISUAL_REGRESSION.md) | Visual regression harness for the notification bell dropdown | `DONE` |
| 27 | [CLIENT-SESSION-12](MVP/CLIENT-SESSION-12_SESSION_MODALS_VISUAL_REGRESSION.md) | Visual regression harness for `SessionDetailModal` and `CreateSessionModal` | `DONE` |
| 28 | [GRP-10](MVP/GRP-10_GROUP_PAGE_VISUAL_REGRESSION.md) | Visual regression harness for the Group page | `DONE` |
| 29 | [CLIENT-NOTIF-1](MVP/CLIENT-NOTIF-1_NOTIFICATION_BELL_DROPDOWN.md) | Notification bell/dropdown — live badge + list + mark-as-read | `DONE` |
| 30 | [SPORT-4](MVP/SPORT-4_REAL_SPORT_ICONS.md) | Use the real per-sport `iconUrl` instead of the Tabler stand-in — **new ticket, not in either epic, filed 2026-08-14, inserted ahead of SPORT-2 (user decision)** | `DONE` |
| 31 | [CLIENT-SESSION-11](MVP/CLIENT-SESSION-11_SHARED_SESSION_CARD.md) | Extract a shared `SessionCard` (compact/full size variant) — de-dupes `UpcomingMatches`' rail row and `SessionListCard` — **new ticket, not in either epic, filed while discussing SPORT-4's `SportIcon` reuse** (2026-08-15) | `DONE` |
| 32 | [HF-20](MVP/HF-20_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from CLIENT-SESSION-9's `UpcomingMatches` second button) | `DONE` |
| 33 | [CLIENT-SESSION-10](MVP/CLIENT-SESSION-10_SESSION_MODAL_UX_UI_PASS.md) | Session card + `SessionDetailModal` UX/UI enhancement pass — **new ticket, not in either epic, filed inserted right after CLIENT-SESSION-9** (2026-08-13) | `DONE` |
| 34 | [CLIENT-SESSION-9](MVP/CLIENT-SESSION-9_PARTICIPATION_ACTION.md) | Wire Join/Accept/Decline/Cancel/Leave button on session card + `SessionDetailModal` (SESSION-9) — **reordered ahead of SPORT-2, user decision 2026-08-13; SESSION-9 backend shipped 2026-08-08, no longer blocking** | `DONE` |
| 35 | [CLIENT-SESSION-8](MVP/CLIENT-SESSION-8_SESSION_COMMENTS.md) | Session comments — discussion section in `SessionDetailModal` (SESSION-10) | `DONE` |
| 36 | [GRP-9](MVP/GRP-9_MOVE_SETTINGS_TAB_GENERAL_SAVE_RULES_SCHEDULE_TO_THE_DEDICAT.md) | Move Settings tab General save (rules/schedule) to the new dedicated `generalData` endpoint — **new ticket, not in either epic, filed while explaining `useSettingsUnsavedGuard` to the user** (2026-08-11) — depends on backend B19 | `DONE` |
| 37 | [SPORT-3](MVP/SPORT-3_SPORT_CATALOG_REAL_FETCH.md) | Sport catalog — fetch the real `GET /api/sports` list instead of the hardcoded 3-sport config (A6) — **reordered ahead of SPORT-2/CLIENT-SESSION-8, user decision 2026-08-07** | `DONE` |
| 38 | [CLIENT-SESSION-7](MVP/CLIENT-SESSION-7_RAIL_CTAS_AND_HOOK_EXTRACTION.md) | Upcoming rail create/join CTAs + create-session hook extraction across pages | `DONE` |
| 39 | [CLIENT-SESSION-6](MVP/CLIENT-SESSION-6_STANDALONE_DISCOVERY.md) | Standalone session discover — real "Join a match" browse UI (SESSION-4) | `DONE` |
| 40 | [CLIENT-SESSION-4](MVP/CLIENT-SESSION-4_INVITE_APPROVAL.md) | Invite-friends + auto-approve at creation, plus approval queue UI (SESSION-6) | `DONE` |
| 41 | [CLIENT-SESSION-5](MVP/CLIENT-SESSION-5_FAVORITE_LOCATIONS.md) | Favorite locations — heart-toggle + `CreateSessionModal` favorites dropdown (LOC-2) | `DONE` |
| 42 | [CLIENT-SESSION-2](MVP/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md) | Standalone-only `CreateSessionModal` redesign (core fields) | `DONE` |
| 43 | [CLIENT-SESSION-3](MVP/CLIENT-SESSION-3_CAPACITY_AND_FEE.md) | Capacity + fee/pricing fields in `CreateSessionModal` (SESSION-5) | `DONE` |
| 44 | [CLIENT-LOC-1](MVP/CLIENT-LOC-1_LOCATIONPICKER_COMPONENT.md) | `LocationPicker` component — search, Google-Maps-link paste-and-resolve, OSM/Leaflet preview pin, Get Directions | `DONE` |
| 45 | [CLIENT-SESSION-1](MVP/CLIENT-SESSION-1_SESSION_UI.md) | Session create/list/join/leave/cancel UI, de-mocks HF-4 (`UpcomingMatches`) | `DONE` |
| 46 | [GRP-8](MVP/GRP-8_INVITATION_LIFECYCLE_POLISH.md) | Sport pill follows an opened group + merged multi-inviter display (invitee + owner/admin views) + reason-gated invitation reject + join-request withdraw + sport-add confirmation on accept — **new ticket, not in either epic, filed while using GRP-7's shipped lifecycle, amended same day** (2026-07-24) — backend B13/B14/B15 all shipped, no longer blocking | `DONE` |
| 47 | [GRP-7](MVP/GRP-7_INVITATION_APPROVE_ACCEPT_LIFECYCLE.md) | Wire the invitation approve/accept lifecycle — owner/admin approval + invitee acceptance — **new ticket, not in either epic, found while closing out GRP-4** (2026-07-23) — blocked on backend B11 | `DONE` |
| 48 | [HF-19](MVP/HF-19_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from GRP-6's app-wide Dialog position/size changes) | `DONE` |
| 49 | [FRIEND-1](MVP/FRIEND-1_FRIENDS_PAGE.md) | Friends page — rail, profile/chat panel, directory search, friend-request actions — **new ticket, not in either epic**, inserted ahead of GRP-4 (user decision, 2026-07-22) | `DONE` |
| 50 | [GRP-4](MVP/GRP-4_INVITE_FRIEND_REAL.md) | Wire invite-friend search to the real backend — blocked on GRP-3, unblocked now that FRIEND-1 is `DONE` | `DONE` |
| 51 | [GRP-2](MVP/GRP-2_SETTINGS_TAB_FULL_DATA_SET.md) | Adapt Settings tab to the full group settings data set — blocked on B7 (group-impl) | `DONE` |
| 52 | [GRP-3](MVP/GRP-3_MEMBERS_TAB.md) | Members tab — group member management (search, invite, 5 status-grouped lists) | `DONE` |
| 53 | [GRP-6](MVP/GRP-6_JOIN_GROUP_MODAL_MULTI_SPORT_FILTER.md) | Join Group modal — multi-select sport filter + grouped results — **new ticket, not in either epic, supersedes GRP-5** | `DONE` |
| 54 | [GRP-5](MVP/GRP-5_JOIN_GROUP_MODAL_SHOW_THE_ACTIVE_SPORT_FILTER.md) | ~~Join Group modal — show the active sport filter~~ — **SUPERSEDED by GRP-6** | `SUPERSEDED` |
| 55 | [GRP-1](MVP/GRP-1_GROUP_PAGE_RESTRUCTURE.md) | Group page restructure — cover banner, Posts/Chat/Settings tabs, inline discovery panel | `DONE` |
| 56 | [FEED-11](MVP/FEED-11_POST_MODAL_VISUAL_REGRESSION.md) | Visual regression harness for the post comment modal — **new ticket, not in either epic** | `DONE` |
| 57 | [FEED-9](MVP/FEED-9_QA_ACCEPTANCE_CHECKLIST.md) | QA / acceptance checklist (integration) | `DONE` |
| 58 | [MSW-1](MVP/MSW-1_STANDALONE_MOCK_SERVER.md) | Standalone mock server for e2e — replaces per-navigation Service Worker setup | `DONE` |
| 59 | [FEED-12](MVP/FEED-12_COMMENT_MODAL_DEEP_LINK.md) | Comment modal fetches its own post + URL-addressable deep link — **new ticket, not in either epic** | `DONE` |
| 60 | [HF-18](MVP/HF-18_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from FEED-7's real group broadcasts) | `DONE` |
| 61 | [FEED-7](MVP/FEED-7_GROUPBROADCASTS_REAL.md) | GroupBroadcasts (real) — de-mocks HF-6 | `DONE` |
| 62 | [FEED-8](MVP/FEED-8_INTEGRATION_HARDENING.md) | Integration hardening (loading/error/empty states, pagination edges) | `DONE` |
| 63 | [FEED-10](MVP/FEED-10_E2E_FEED_GROUPS_JOURNEY.md) | E2E functional test — feed/groups journey | `DONE` |
| 64 | [HF-17](MVP/HF-17_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from FEED-6's real trending hashtags) | `DONE` |
| 65 | [FEED-4](MVP/FEED-4_GROUP_SWITCHING_REAL.md) | Group switching (real groups list) | `DONE` |
| 66 | [FEED-5](MVP/FEED-5_GROUP_CREATE_JOIN_MODALS.md) | CreateGroupModal + JoinGroupModal (real) | `DONE` |
| 67 | [FEED-6](MVP/FEED-6_TRENDINGHASHTAGS_REAL.md) | TrendingHashtags (real) — de-mocks HF-5 | `DONE` |
| 68 | [SPORT-1](MVP/SPORT-1_SPORT_SWITCHER_REAL.md) | Sport switcher (real) — de-mocks HF-2, **new ticket, not in the epics** | `DONE` |
| 69 | [HF-15](MVP/HF-15_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from FEED-1's real feed + delete menu) | `DONE` |
| 70 | [HF-16](MVP/HF-16_REGENERATE_VISUAL_REGRESSION_BASELINES_FOLLOW_UP_TICKET_NOT_.md) | Regenerate visual-regression baselines (follow-up from FEED-2's comment button + dialog) | `DONE` |
| 71 | [FEED-1](MVP/FEED-1_FEED_POSTCARD_REAL.md) | Feed + PostCard (real — absorbs post-impl's old F1) | `DONE` |
| 72 | [FEED-2](MVP/FEED-2_COMMENTSECTION_REAL.md) | CommentSection (real) | `DONE` |
| 73 | [FEED-3](MVP/FEED-3_CREATEPOSTFORM_REAL.md) | CreatePostForm (real) | `DONE` |
| 74 | [AUTH-8](MVP/AUTH-8_E2E_AUTH_JOURNEY.md) | E2E functional test — auth journey | `DONE` |
| 75 | [AUTH-7](MVP/AUTH-7_QA_ACCEPTANCE_CHECKLIST.md) | QA / acceptance checklist (auth) | `DONE` |
| 76 | [FEED-0](MVP/FEED-0_TYPES_TANSTACK_QUERY_HOOKS_SCAFFOLD.md) | Types + TanStack Query hooks scaffold | `DONE` |
| 77 | [AUTH-6](MVP/AUTH-6_AUTH_HARDENING.md) | Auth hardening (errors, rate-limit messaging, a11y) | `DONE` |
| 78 | [AUTH-5](MVP/AUTH-5_401_REFRESH_RETRY_INTERCEPTOR.md) | 401 refresh-retry interceptor | `DONE` |
| 79 | [HF-14](MVP/HF-14_REGENERATE_VISUAL_BASELINES.md) | Regenerate visual-regression baselines (follow-up from AUTH-4's TopBar avatar-menu change) | `DONE` |
| 80 | [AUTH-4](MVP/AUTH-4_PROTECTED_ROUTE_LOGOUT.md) | ProtectedRoute + logout | `DONE` |
| 81 | [HF-13](MVP/HF-13_REGENERATE_VISUAL_BASELINES.md) | Regenerate visual-regression baselines (follow-up from AUTH-1's cn() border-hairline fix) | `DONE` |
| 82 | [AUTH-1](MVP/AUTH-1_LOGIN.md) | Login | `DONE` |
| 83 | [AUTH-2](MVP/AUTH-2_REGISTER.md) | Register | `DONE` |
| 84 | [AUTH-3](MVP/AUTH-3_SESSION_BOOTSTRAP.md) | Session bootstrap on app load | `DONE` |
| 85 | [HF-12](MVP/HF-12_CI_BOOTSTRAP.md) | CI bootstrap + first green run (follow-up from HF-9 item 7) | `DONE` |
| 86 | [MSW-0](MVP/MSW-0_MOCK_SERVICE_WORKER_HANDLER_SETUP.md) | Mock Service Worker handler setup | `DONE` |
| 87 | [AUTH-0](MVP/AUTH-0_TYPES_API_CLIENT_STORE.md) | Types, API client, auth store | `DONE` |
| 88 | [HF-5](MVP/HF-5_TRENDINGHASHTAGS.md) | TrendingHashtags | `DONE` |
| 89 | [HF-6](MVP/HF-6_GROUPBROADCASTS.md) | GroupBroadcasts | `DONE` |
| 90 | [HF-7](MVP/HF-7_HOMEFEEDPAGE.md) | HomeFeedPage — layout, state wiring, data hook | `DONE` |
| 91 | [HF-8](MVP/HF-8_RESPONSIVE_A11Y_PASS.md) | Responsive + accessibility pass | `DONE` |
| 92 | [HF-10b](MVP/HF-10B_VISUAL_REGRESSION_CI_GATE.md) | Full-page visual regression + CI gate | `DONE` |
| 93 | [HF-11](MVP/HF-11_E2E_HOME_FEED_JOURNEY.md) | E2E functional test — Home Feed journey | `DONE` |
| 94 | [HF-9](MVP/HF-9_QA_ACCEPTANCE_CHECKLIST.md) | QA / acceptance checklist (Home Feed) | `DONE` |
| 95 | [HF-00](MVP/HF-00_PROJECT_SCAFFOLDING.md) | Project scaffolding + tooling (Vite, TS, Tailwind, Storybook, Playwright) | `DONE` |
| 96 | [HF-0](MVP/HF-0_SHARED_TYPES_AND_MOCK_DATA.md) | Shared types + mock data layer | `DONE` |
| 97 | [HF-10a](MVP/HF-10a_VISUAL_REGRESSION_HARNESS.md) | Visual-regression harness (baseline screenshots from reference HTML) | `DONE` |
| 98 | [HF-1](MVP/HF-1_TOPBAR_NAVTABS.md) | TopBar + NavTabs | `DONE` |
| 99 | [HF-2](MVP/HF-2_SPORTSWITCHER.md) | SportSwitcher | `DONE` |
| 100 | [HF-3](MVP/HF-3_POSTCARD_FEED.md) | PostCard + Feed | `DONE` |
| 101 | [HF-4](MVP/HF-4_UPCOMINGMATCHES.md) | UpcomingMatches | `DONE` |

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
  itself has no backend dependency — see `client/docs/MVP/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`.
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
A9 (`modules/sport/sport-impl/docs/BACKLOG_MVP.md`, backend, `TODO`) — **hard** dependency for
  ADMIN-2: the schema editor has nothing to read or write until A9’s
  `GET`/`PUT /api/sports/{sportId}/attribute-schema` exist. ADMIN-1 (the `/admin` route +
  guard) has no backend dependency and can be built at any time. Both filed together with A9
  from the same design session — see `documentation/md/SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`.
A9 → **SPORT-2** (hard): SPORT-2 was briefly closed as superseded by A9 on 2026-08-20 and then
  **reinstated the same day (user decision)** at #3, because it covers the *user-facing* half —
  rendering a user’s per-sport attribute fields on their sport profile — which A9 and ADMIN-2 do not.
  It was **rescoped in place**: instead of the static `sportAttributeConfig.ts` it originally
  proposed, it now renders A9’s fetched schema. That rescope was mandatory, not cosmetic — its
  original spec was keyed on football/basketball/tennis (deactivated by A6) and assumed the closed
  `SportKey` union SPORT-3 replaced with a live-derived `string`, so it could not have been built
  as written. ADMIN-2 and SPORT-2 are siblings over the same A9 schema: admin edits it, SPORT-2
  renders it.
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
PROFILE-0..PROFILE-9 (new, filed 2026-08-26, from a `/feature` session against
  `client/design-reference/design-reference-profile.html`) — full design and per-tab scope
  corrections in `client/docs/PROFILE_PAGE_DESIGN.md`. PROFILE-0 → PROFILE-1/2/3/4/5 (all need its
  types/hooks). PROFILE-4 (Settings tab, rescoped to a per-sport profile editor) also hard-depends on
  **SPORT-2** — it's the ticket that finally hosts SPORT-2's `SportAttributesFields`. PROFILE-1..5 →
  PROFILE-6 (page integration) → PROFILE-7 (hardening)/PROFILE-8 (E2E) → PROFILE-9 (QA). No backend
  work anywhere in this chain — every field these tickets touch is already served
  (`UserResponse`/`UpdateProfileRequest`, `GET /api/posts/user/{userId}`, `UserSportProfile`'s
  `skillLevel`/`yearsOfExperience`/`preferredPosition`, `PUT /api/sports/profiles/{profileId}`).
ACCOUNT-1 (new, filed 2026-08-26, split out of the same `/feature` session — user decision: account-
  level settings don't belong on `/profile`) — no dependency on any PROFILE-* ticket. Lives on
  `TopBar`'s avatar dropdown instead. Its own toggle-mapping design question is left open in the
  ticket itself, not resolved at filing time.
FRIEND-2 (filed 2026-08-26 at PROFILE-0 pickup — user decision) — **DONE 2026-08-29.** Backend U14
  collapsed to no change — U11 already narrowed `GET /api/users/{userId}` to `UserInfoResponse`
  (`id, fullName, username, avatarUrl, coverUrl, bio`, `hasRole('USER')`-gated). Shipped as pure
  client cleanup: new Friends-owned `useUserInfo()` at the `features/friends/` root (not `hooks/`)
  consuming that endpoint, typed 1:1 with `UserInfoResponse` incl. `username: string | null`;
  `useFriendsPageData` switched to it; `features/profile/useUserProfile` **deleted** (zero
  importers); stale `UserResponse` doc comments corrected; MSW `GET /api/users/:userId` handler
  now returns `username` too. No dependency on any PROFILE-* ticket beyond PROFILE-0's relocation.
  **Scope change same session (user decision, folded in rather than filed as FRIEND-3):** added the
  unfriend control the Friends feature never had — `FriendProfilePanel`'s `FRIENDS` state now shows
  a `Friend ▾` button → `DropdownMenu` (`Unfriend` only) → `UnfriendConfirmDialog` → the pre-existing
  `DELETE /api/users/friends/{friendId}` (U1 `removeFriend`); new `useUnfriend` hook, selection
  clears on success, new MSW delete handler, `friends-journey.spec.ts` step 8.
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
| SESSION-9: expose the caller's own participant status via `callerParticipation` on `SessionResponse` | `modules/session/docs/BACKLOG_MVP.md` · SESSION-9 | CLIENT-SESSION-9 — session card + `SessionDetailModal` Join/Accept/Decline/Cancel/Leave button; scoped down from CLIENT-SESSION-4 to just this (user decision, 2026-08-03) — CLIENT-SESSION-4's invite-UI + approval-queue scope is unaffected, still `TODO` | `DONE` (2026-08-08) |
| ~~Chat module (new `modules/social/chat-impl`, never existed beyond a docs folder, since deleted)~~ | ARCHIVED (2026-07-26) — see `documentation/md/archive/chat/` — fresh chat re-plan pending | ~~CHAT-2, CHAT-4~~ | `N/A` |

---
