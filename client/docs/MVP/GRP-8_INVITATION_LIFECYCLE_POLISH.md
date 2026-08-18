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
