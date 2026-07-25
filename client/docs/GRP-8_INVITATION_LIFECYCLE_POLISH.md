# GRP-8 · Sport pill follows an opened group, merged multi-inviter display, reason-gated reject, join-request withdraw, and sport-add confirmation on accept

**Status:** `DONE` (2026-07-25)
**Type:** Enhancement
**Dependencies:** GRP-3, GRP-4, GRP-7 (all `DONE`), backend B13/B14/B15 (all `DONE`,
`modules/social/group-impl/docs/BACKLOG_MVP.md`)
**Filed:** 2026-07-24, user-requested, amended same day with parts 4–5

## Design (as approved, with one delta)

Five independent parts, all shipped in one PR since every backend dependency (B13/B14/B15) was
already `DONE` at pickup.

**Delta from the filed ticket — part 5 is a plain intro + OK, not an `AddSportModal` note prop.**
The ticket originally sketched adding an optional `note`/description prop to `AddSportModal` itself,
shown inline above its form fields. At pickup the user asked for this decoupled instead: a small,
separate `AddSportIntroDialog` shows the explanatory copy with a single **OK** button (not a
Confirm/Cancel pair), and only once dismissed via OK does the existing `AddSportModal` open,
pre-selected to the invitation's sport. `AddSportModal` itself is unchanged. Dismissing either dialog
(the intro's own close, or `AddSportModal`'s cancel) leaves the invitation untouched either way.

### Part 1 — sport pill follows the opened group

`feedSpaceStore.selectGroup(groupId, groupSportId)` now also derives `activeSport` via
`sportKeyForId(groupSportId)` whenever `groupId !== null` — a group is 1:1 with a sport, so this is
an unambiguous derivation done once at the store level. Selecting "All" (`groupId === null`) leaves
`activeSport` untouched; a `groupSportId` outside the 3 known `SportKey`s also leaves it untouched
(same "unknown sport, don't crash" precedent as `useSportProfilesForUser`'s own silent drop).
`GroupSpaceSwitcher`'s pill click, `GroupDiscoveryPanel`'s card click, and `CreateGroupModal`'s
`onSuccess` already passed `groupSportId` — confirmed, no changes needed at those call sites.

GRP-7's `onAccepted(groupId)` callback (in `useGroupInvitationsData`) becomes
`onAccepted(groupId, sportId)`, using B15's new `GroupInvitationResponse.sportId`. `GroupsPage.tsx`
drops the `setActiveSport('all')`-then-select workaround entirely — it now calls
`selectGroupAndShowPosts(groupId, sportId)` directly, the same shape as every other selection call
site.

**Follow-up fix (same day, found in review, revised three times) — the reverse direction was still
broken.** The initial part-1 pass only handled *group → sport* sync (opening a group drives the
pill). It missed *sport → group*: `setActiveSport`'s pre-existing logic special-cased
`sport === 'all'` as "always compatible," so switching to "All" never cleared the selected group.
Repro: open a football group on the Groups page (pill correctly shows Football) → navigate to Home
Feed → switch to "All" there → navigate back to Groups → the football group's tabs are still
showing, but the pill reads "All" — a real, user-reported mismatch, and the same root cause also
meant clicking the "All" pill *while looking at a specific group* did nothing to the group selection
(it should snap back to the "All groups" discovery view).

*First pass:* removed the `sport === 'all'` special case from `setActiveSport`'s `stillValid`
check, so switching to "All" always cleared `selectedGroupId`/`selectedGroupSportId` — a deliberate
reversal of a decision `feedSpaceStore`'s own doc comment previously recorded (GRP-4/FEED-4: "All is
always compatible, so switching to it never resets the selection"). This fixed the reported repro,
but introduced a *new* bug, immediately caught by the user: since `activeSport` is a store shared
with Home Feed, switching to "All" *on Home Feed* now also silently deselected whatever group was
open on the Groups page — not the intent. `activeSport` genuinely is shared cross-page (FEED-4's own
design), but "does this sport switch still make sense for the group I have open" is a question only
the Groups page can meaningfully ask.

*Revised:* moved that decision entirely out of the shared store. `setActiveSport` is now a pure
setter (`set({ activeSport: sport })`, nothing else) — it never touches `selectedGroupId` regardless
of caller. `GroupsPage.tsx` owns the actual decision via a new `guardedSetActiveSport`: after setting
the sport, it explicitly calls `selectGroup(null)` only if the picked sport doesn't match the
currently open group's own sport (covers both "All" and any other incompatible sport) — Home Feed's
own `setActiveSport` call never reaches this logic at all, since it's local to `GroupsPage.tsx`, not
the store. At this point `activeSport` was still one store (`feedSpaceStore`) shared by both pages,
just no longer directly mutated by the other page's actions — `GroupsPage` computed a derived
`effectiveActiveSport` (the open group's own sport overriding the raw shared value) to paper over the
remaining possibility of drift.

**Final revision, same day (user-requested) — full separation, not just decoupled writes.** The user
asked directly: separate `activeSport` between the two pages entirely, each page saving and handling
its own independently, rather than one shared field with one-directional guards. This is a cleaner
fix than the previous revision, and makes `effectiveActiveSport` unnecessary: `feedSpaceStore` split
into two independent stores, `homeFeedStore.ts` (Home Feed's own `activeSport`) and
`groupsPageStore.ts` (the Groups page's own `activeSport` + `selectedGroupId`/`selectedGroupSportId`
+ `selectGroup` — everything Groups-specific already was). Home Feed's `goToGroup` (clicking a group
post's "> groupname" link) now calls `groupsPageStore`'s `selectGroup` directly as a one-off
cross-store write — expressing "open this group when you land on the Groups page" — without touching
its own `homeFeedStore.activeSport` at all. Since nothing outside `GroupsPage.tsx` can write to
`groupsPageStore.activeSport` anymore, that field can never drift from the current selection by
construction — `effectiveActiveSport` was removed and every prop that used it
(`SportSwitcher`/`Feed`/`UpcomingMatches`) reverted to plain `activeSport`. `client/CLAUDE.md`'s
cross-page-state section updated (its original "promote to a shared store" guidance is now struck
through with a note explaining the reversal) since this is a real, deliberate architecture change
future work should know about, not just a bug fix. Old `feedSpaceStore.ts`/`.test.ts` deleted; new
`groupsPageStore.test.ts` and `homeFeedStore.test.ts` (including one test asserting the two stores are
genuinely independent) replace it.

**Guard interaction, not originally scoped:** since switching sport can now silently deselect a group,
it can also silently discard an unsaved Settings-tab edit (the same class of "navigate away and lose a
draft" gap `useSettingsUnsavedGuard` already exists to prevent for every other group-switching action).
`GroupsPage.tsx`'s `SportSwitcher.onChange` now goes through `guardedSetActiveSport`
(`settingsGuard.guard(...)`, same pattern as `guardedSelectGroupAndShowPosts`/
`guardedSetActiveGroupTab`) instead of calling `setActiveSport` directly.

New e2e coverage in `group-invitations.spec.ts`: opens a group, switches to "All" on Home Feed,
returns to Groups and confirms the group is still open with its own sport pill correct, then confirms
clicking "All" directly on the Groups page does deselect it.

### Part 2 — Invitations section: merged inviters + reject reason

`GroupInvitationsSection` renders every co-inviter via a new `formatNameList()` helper
(`shared/lib/formatNameList.ts` — Oxford-comma join, shared with part 4) instead of the singular
`inviterFullName`: *"Group invitation from {A}"* / *"…from {A} and {B}"* / *"…from {A}, {B}, and {C}"*.

Reject no longer fires immediately — it opens a new `RejectInvitationConfirmDialog` (same
Dialog/DialogContent/DialogHeader shape as `DeleteGroupConfirmDialog`) with an optional-reason
`Textarea` (user decision: not required — Reject stays enabled with an empty reason, unlike
`CreatePostForm`'s required-field gating). `useRejectInvitation` now takes `{ invitationId, reason? }`
and PUTs `{ reason }` in the body (B13's `RejectInvitationRequest`).

### Part 3 — Join requests section (no confirmation, user decision)

New section on `GroupDiscoveryPanel`'s "All groups" view, below the joined-groups grid (order:
Invitations → your groups grid → Join requests, per spec) — the current user's own pending join
requests (`useJoinRequests`, already used elsewhere for `JoinGroupModal`'s "already requested"
badge), each with a direct "Withdraw" button. New `useCancelJoinRequest()` hook mirrors
`useCancelInvitation` exactly (`DELETE /groups/join-requests/{requestId}`, blunt `feedKeys.all`
invalidation). Hidden entirely when empty, same convention as the Invitations section above it.

### Part 4 — Members tab approval queue: merged inviters

`GroupMembersTab`'s invitation-row subtitle switches from `Invited by ${inviterFullName}` to
`Invited by ${formatNameList(inviterFullNames)}` — the only change on this side, since B14 keeps
Approve/Decline operating on the single canonical row exactly as today.

### Part 5 — sport-add confirmation on accept

Before calling `acceptInvitation`, `GroupsPage.tsx` checks whether `sportKeyForId(invitation.sportId)`
is already in the current user's `data.sportProfiles`. If yes, accept proceeds exactly as today. If
no, a new `sportGate` state (`{ invitationId, sportKey, step: 'intro' | 'form' }`) opens
`AddSportIntroDialog` first, then (on OK) the existing `AddSportModal` pre-selected to just that one
sport (`availableSports={[sportKey]}`). On successful profile creation, `GroupsPage` chains into
`groupInvitationsData.acceptInvitation`. Cancelling either dialog leaves the invitation pending.
**Edge case not explicitly in the ticket:** if `sportKeyForId` returns `undefined` (an invitation for
a sport the client doesn't map yet), the gate is skipped entirely and accept proceeds directly — same
precedent as the store's own unknown-sport handling in part 1.

## Tests

- New `shared/lib/formatNameList.test.ts` (4 cases: 0/1/2/3+ names).
- `feedSpaceStore.test.ts`: 3 new cases for `selectGroup`'s `activeSport` derivation (matching sport,
  "All" untouched, unknown sportId untouched), plus the follow-up fix's 2 updated `setActiveSport`
  cases — the two that previously asserted the group selection survives switching to "All" now assert
  the opposite (selection clears), and a new case confirms this holds even right after switching to
  the group's own sport (the original "bug found live" case, now composed with the reversed "All"
  behavior).
- `GroupDiscoveryPanel.test.tsx`: updated the existing invitation-row assertion to the new copy, added
  a merged-co-inviter case, and two new tests for the Join requests section (hidden when empty,
  Withdraw dispatches the request id).
- `GroupMembersTab.test.tsx`: updated the existing single-inviter assertion (unchanged text — 1-name
  `formatNameList` output is identical to the old copy) and added a merged-co-inviter case.
- All touched fixture-building functions (`GroupDiscoveryPanel`/`GroupMembersTab`
  stories+tests, `useInviteFriendModalData.test.tsx`, `e2e/mocks/fixtures.ts`,
  `e2e/mocks/handlers/groups.ts`) updated for `GroupInvitation`'s two new required fields
  (`sportId`, `inviterFullNames`).
- `e2e/flows/group-invitations.spec.ts`: updated the existing accept/reject tests for the new copy and
  the reject-dialog flow; added 2 new tests (join-request withdraw, sport-gate-on-accept). The
  join-request test seeds `mockJoinRequest` via a new `seed-join-requests` admin route
  (`mockServer.ts`/`handlers/groups.ts`) rather than driving `JoinGroupModal`'s search UI, which has
  no existing e2e coverage to build on. `client/docs/E2E_OVERVIEW.md` §6 gained a full entry for
  `group-invitations.spec.ts` (it had none before — a pre-existing gap from GRP-7, fixed here since
  this ticket materially changed the file).

**Verification status — `pnpm e2e` is now fully green (46/46).** `pnpm test` (529 tests, 93 files) is
fully green, `tsc -b` is clean, lint is clean, and `pnpm build-storybook` succeeds including every
new/changed story.

The earlier session had `pnpm e2e` blocked by a genuine sandbox environment issue: a stray leftover
Vite dev server process on port 5173 was silently reused by Playwright's `webServer` config
(`reuseExistingServer: !process.env.CI`), and something about that stale process made every spec's
login step (`page.waitForURL` after clicking "Log in") time out — confirmed unrelated to this ticket's
code via a controlled check (stashing every change and re-running against the clean pre-ticket base
commit reproduced the identical universal failure). Killing that stray process and running clean
resolved it entirely — a real fix, not a retry-until-lucky workaround.

With a clean environment, three **real** issues surfaced and were fixed:
1. **My own test's locator bug:** `getByRole('button', { name: 'All' })` without `exact: true` — Playwright's
   default substring matching means "All" matches "Foot**ball**"/"Basket**ball**" too (both end in
   "...ball", which contains "all"). Fixed both occurrences in the new cross-page test; the existing
   suite's own convention (`{ name: 'All', exact: true }`, used everywhere else) confirmed this was the
   right fix, not a new pattern.
2. **Mock server bug, not product code:** `seedZeroSportProfilesOnNextLoad`'s `sportProfilesEmpty`
   override only faked the `GET /sports/profiles/user/:id` response — the *real* underlying session
   state stayed at the 3-profile default fixture (which already includes Basketball). My part-5 sport-gate
   test was the first to combine this override with an actual `POST /sports/profiles` call, which 400'd
   ("Already has a profile for this sport") against that stale real state. Fixed by having the override
   also clear the real state (new `seedZeroSportProfilesState` in `handlers/sport.ts`, wired into
   `mockServer.ts`'s admin route) — same "seed real state, not just a faked response" precedent as
   `seedPostsState`/`seedJoinRequestsState`.
3. **A genuine, intentional consequence of part 1 rippling into a pre-existing test.** Part 1 makes
   *any* group selection (not just the ones GRP-8 itself added) drive this page's own sport pill to
   match — including selecting a group via `GroupSpaceSwitcher`'s own pill row, and creating a new
   group. `feed-groups-journey.spec.ts`'s pre-existing "create a group" step assumed the sport pill was
   still "All" (true before GRP-8, since only `setActiveSport` calls used to change it) and tried to
   manually pick a sport from `CreateGroupModal`'s select — which no longer renders once the sport pill
   is already locked to Football from the preceding step's group selection (`lockedSport === null` gates
   it). The very next step then tried to reach a *Tennis* group via the same sport-filtered switcher,
   which no longer showed it. Both were pre-existing FEED-5/GRP-1 test steps, not part of GRP-8's own
   scope — updated to explicitly reset the sport pill to "All" where the step's intent requires seeing
   across sports, and to assert the now-locked `CreateGroupModal` state instead of a manual select.

### Follow-up: headless-specific flakiness under `pnpm e2e`'s default 8-way parallelism

A later run surfaced 3 tests failing that had just been verified green — but only under the full
`pnpm e2e` suite (46 tests, 8 workers), never in isolation or under an artificially-stressed repeat of
the same single test. That "only reproduces at full-suite parallelism" signature pointed at genuine
timing races exposed by contention, not simple flakiness, and both were confirmed real and fixed:

1. **`feed-groups-journey.spec.ts` step 1** (Load more): `useInfiniteScrollSentinel`'s
   `IntersectionObserver` (`rootMargin: '200px'`) and the manual "Load more" button both trigger the
   exact same fetch. Under slow/contended rendering, the sentinel can auto-fire first; the button then
   disables or disappears (`hasMorePosts` flips false) mid-click, and Playwright's actionability retry
   times out on the now-detached element (`element was detached from the DOM, retrying`). Reproduced
   reliably via `--repeat-each=8..12 --workers=8` on the single spec file (never on 1 worker). This is a
   real, benign race for an actual user too (a real user would just see the second page already loaded)
   — fixed at the test level: only click "Load more" if it's still visible, then assert the end state
   regardless of which trigger won.
2. **`feed-groups-journey.spec.ts` step 9** (Basketball filter) and **`group-invitations.spec.ts`**'s
   "survives switching sport on Home Feed" test: both navigate Groups → Home mid-test and then click an
   unscoped `page.getByRole('button'/'group', { name: ... })` targeting Home Feed's own `SportSwitcher`.
   `GroupsPage` and `HomeFeedPage` render that same shared component with the identical accessible name
   (`role="group"`, `aria-label="Sport filter"`) — under a contended route transition, `GroupsPage`'s own
   pills can still be attached for a moment after `page` already reports the new URL, so the click can
   silently land on the *previous* page's pill instead (confirmed via the failing run's
   `error-context.md` page snapshot: Home Feed's own "All" pill stayed `[pressed]`, proving the
   Basketball click never reached it). Fixed by waiting for Home Feed's page-unique `sr-only` `<h1>`
   ("Home Feed") before interacting with its Sport filter in both specs — reproduced reliably across
   3/3 full-suite runs before the fix, 7/7 clean after.

A third originally-reported failure (`group-invitations.spec.ts`'s sport-gate-on-accept test) could not
be reproduced even under `--repeat-each=15 --workers=8` in isolation — most likely an incidental victim
of the same-run system load rather than its own bug; left as-is.

**Verification status, updated:** `pnpm e2e` — 7/7 consecutive full-suite runs green after both fixes
(previously 3/3 consecutive failures at the same two spots before them).
   `client/docs/E2E_OVERVIEW.md`'s catalog updated for both changed steps.
