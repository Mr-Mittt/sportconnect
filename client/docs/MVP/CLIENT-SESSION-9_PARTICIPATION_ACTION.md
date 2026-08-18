# CLIENT-SESSION-9 — Participation action on the session card + `SessionDetailModal`

**Status:** DONE (2026-08-13)
**Dependency:** SESSION-9 (`modules/session/docs/BACKLOG_MVP.md`, `DONE` 2026-08-08) — see
`modules/session/docs/MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md` for the backend side
(`SessionResponse.callerParticipation`).

## What shipped

Both the session card (`SessionListCard`, `UpcomingMatches`) and `SessionDetailModal` now derive
the caller's Join/Accept/Decline/Cancel/Leave action from `session.callerParticipation` instead of
the old `SessionDetailModal`-only, `participants`-array-lookup derivation (which was always a false
negative for an `INVITED`/`REQUESTED` caller, since `participants` only ever holds `JOINED` rows
for a non-manager). Mapping (shared in `shared/lib/sessionParticipation.ts`'s
`getParticipationAction`):

- no row, or `LEFT` → **Join** (`POST /sessions/{id}/join`)
- `INVITED` → **Accept** (same join endpoint — an invitee's own join call always resolves straight
  to `JOINED`) and, modal-only, **Decline** (`DELETE /sessions/{id}/leave`)
- `REQUESTED` → **Cancel** (same leave endpoint)
- `JOINED` → **Leave** (same leave endpoint)
- session not `SCHEDULED`/`ONGOING` → no action

## Design decisions (approved before implementation)

**Card layout — recommended option, user-approved:** the card keeps its existing "View details"
button and gets one additional sibling button for the primary action above. For `INVITED`, the
card shows **Accept** only — **Decline** stays modal-only, to avoid a 3rd button on a compact card
(`SessionListCard`'s Discover/My-sessions grid, and especially the narrower `UpcomingMatches` rail
card). This was a real design choice, not dictated by the ticket text alone — see the three
options and their previews discussed at pickup.

**No confirmation step for Decline/Cancel:** matches this codebase's existing precedent (Join/Leave
already have no confirm step) and the backend note that a self-initiated leave/decline/cancel never
sets `rejectReason` (that field stays exclusive to manager-initiated `rejectParticipant`).

## What was built

- **Types:** `Session.callerParticipation: SessionParticipant | null` added
  (`shared/types/session.ts`).
- **`shared/lib/sessionParticipation.ts`:** the single `getParticipationAction(session)` pure
  helper both the card and the modal call — one source of truth for the status→action mapping,
  instead of duplicating it in three places.
- **`features/session/hooks/useSessionParticipationAction.ts`:** wraps `useJoinSession`/
  `useLeaveSession`, exposing `onParticipationAction(sessionId, kind)` (routes Join/Accept to the
  join endpoint, Cancel/Decline/Leave to the leave endpoint) and
  `isParticipationActionPending(sessionId)` (keyed off each mutation's own `variables`, so a
  shared instance across a list of cards only shows the pending state on the one card actually in
  flight).
- **`SessionListCard.tsx`:** restructured from a single full-card `<button>` into a `<div>` with
  descriptive content plus two sibling buttons — "View details" and the participation action, when
  one applies. Both carry `${title} — …` `aria-label`s (same disambiguation pattern
  `UpcomingMatches` already used), since the title itself now renders as plain text outside either
  button.
- **`UpcomingMatches.tsx`:** same two-sibling-button treatment on its rail card.
- **`SessionDiscoverPanel.tsx`, `SessionDateGroup.tsx`, `SessionDiscoverModal.tsx`:** thread
  `onParticipationAction`/`isParticipationActionPending` straight through to the `SessionListCard`s
  they render — pass-through only, no logic.
- **`SessionDetailModal.tsx`:** swapped the `isJoined`/`participants`-array derivation for
  `getParticipationAction(session)`; renders Join / Accept+Decline / Cancel / Leave. **No
  prop-signature change** — Accept reuses the existing `onJoin`/`isJoining` props, Decline/Cancel
  reuse the existing `onLeave`/`isLeaving` props.
- **`useMatchesPageData.ts`, `useDiscoverModalData.ts`:** swapped their ad-hoc
  `useJoinSession()`/`useLeaveSession()` pair for `useSessionParticipationAction()`, so the modal's
  existing `onJoin`/`onLeave` and the card's new `onParticipationAction` share the same mutation
  instances (no redundant duplicate mutations).
- **`MatchesPage.tsx`, `HomeFeedPage.tsx`, `GroupsPage.tsx`, `FriendsPage.tsx`:** wired the new
  props through. Each of the three rail-hosting pages (Home Feed/Groups/Friends) instantiates its
  own `useSessionParticipationAction()` for the `UpcomingMatches` rail card — separate from
  `useDiscoverModalData`'s own instance, which backs that same page's Discover-modal result grid.

## Non-obvious constraints

- **Existing e2e/component-test selectors broke.** Before this ticket, `SessionListCard`'s
  accessible name was its entire rendered text (one full-card `<button>`), so tests found a card by
  regexing the session title alone (`getByRole('button', { name: /Sunday pickup run/ })`). Now both
  sibling buttons' `aria-label`s contain the title, so that regex matches two elements. Fixed by
  disambiguating to `{ name: /<title> — View details/ }` everywhere a test opens the detail dialog
  by title — `MatchesPage.test.tsx`, `HomeFeedPage.test.tsx`, `SessionDateGroup.test.tsx`,
  `SessionDiscoverPanel.test.tsx`, `SessionDiscoverModal.test.tsx`, `UpcomingMatches.test.tsx`, and
  `e2e/flows/matches-journey.spec.ts` (steps 3/3b/3c/4/5/7/9).
- **The status badge moved out of the button.** `matches-journey.spec.ts` step 4 used to assert
  `.toContainText('Cancelled')` on the card's one full-card button; now the status badge is plain
  card content, not inside either button. Rewritten to assert on the card's own text instead.
- **A button's `aria-label` doesn't change while pending** — only its visible text does (`Join` →
  `Working…`). This is deliberate: the accessible name stays meaningful to a screen-reader user
  mid-action rather than announcing an ambiguous "Working…" with no context of which session.
  Tests that assert the disabled-while-pending state query by the idle label, not `/working/i`.
- **A group-linked session's creator (owner/admin) is not auto-added as a participant** (pre-existing
  `createSession` behavior, unchanged by this ticket) — so their own card shows **Join** even though
  they manage the session. Not special-cased here; same gap SESSION-9's backend writeup already
  flagged as pre-existing.
- **MSW mock backend (`e2e/mocks/handlers/sessions.ts`)** now computes and attaches
  `callerParticipation` on every session-returning response (`resolveCallerParticipation`/
  `withCallerParticipation` helpers), mirroring what the real backend does — needed so a mocked
  card's action actually differs per session as an e2e journey joins/leaves/accepts through it,
  not just a static `null` on every fixture.

## Tests

- Unit/component: `SessionListCard.test.tsx`, `UpcomingMatches.test.tsx`, `SessionDetailModal.test.tsx`
  extended with the 4/5-state coverage (Join / Accept+Decline / Cancel / Leave / hidden-when-not-
  joinable, plus the pending-disabled state). `MatchesPage.test.tsx`, `HomeFeedPage.test.tsx`,
  `SessionDateGroup.test.tsx`, `SessionDiscoverPanel.test.tsx`, `SessionDiscoverModal.test.tsx`
  updated for the new required props and disambiguated selectors.
- Storybook: new states added to `SessionListCard.stories.tsx` (`CallerJoined`/`CallerInvited`/
  `CallerRequested`/`ParticipationActionPending`), `UpcomingMatches.stories.tsx` (`CallerJoined`),
  and `SessionDetailModal.stories.tsx` (`InvitedPendingAcceptDecline`/`RequestedPendingApproval`,
  `AlreadyJoined` rewritten to use `callerParticipation` instead of the retired `currentUserId`
  trick). `pnpm exec storybook build` succeeds.
- E2E: `matches-journey.spec.ts` gets a new step 5b (card-level Join → Leave round trip, no dialog)
  and every pre-existing step that opens a card by title is disambiguated (see above).
  **Could not be executed live in this environment** — even a completely unmodified spec
  (`auth-journey.spec.ts`) times out identically in this sandbox (`page.waitForURL` never resolves
  past the login step), confirming this is a pre-existing sandbox/Playwright limitation, not a
  regression from this ticket. Verified instead by: full static review of every selector this
  ticket's DOM changes could affect, plus `pnpm exec tsc -b`, `pnpm lint`, and the full
  `pnpm exec vitest run` suite (120 files, 822 tests, all green).
- `pnpm exec vitest run` (full suite): 822/822 passing.
- `pnpm exec tsc -b --noEmit`: clean.
- `pnpm lint`: clean (2 pre-existing unrelated warnings in `SessionStartTimePicker.tsx`).

## Follow-up / known gaps (not this ticket)

- `useLeaveSession.ts`'s doc comment was updated to reflect SESSION-9's widened accepted statuses
  (was stale — said "rejected if not currently JOINED").
- E2E could not be run live in this sandbox (see above) — worth a human/CI verification pass before
  merge, same as any change touching `e2e/flows/*.spec.ts` in an environment where it could be run.

## Delta (2026-08-13, same day, user-reported behavior gap)

The Upcoming rail's "View details" button (`UpcomingMatches`, on Home Feed/Groups/Friends) still
navigated to `/matches?session={id}` — switching the user away from whatever page they were on,
just to see one session's detail. User flagged this as unwanted: it should open
`SessionDetailModal` **in place** instead, same as the rail's new participation-action button
already does without navigating.

**Scope decisions (asked, not assumed):** applies to all three rail-hosting pages (Home Feed,
Groups, Friends), not just Home Feed. The in-place modal is view + Join/Leave only — no Cancel
session / approval queue, even for a session the caller manages (unlike the Matches page's own
modal, which has full manager parity). This is a real, deliberate feature gap versus clicking
through to `/matches` (a rail session, unlike a Discover-sourced one, genuinely can be
self-managed) — accepted as the simpler option; full parity remains reachable via "See all" →
Matches page.

**What changed:** turned out to need almost no new code. Each of the three pages already builds a
fully-wired `SessionDetailModal` instance off `useDiscoverModalData` for its own Discover flow —
including a `canManage: false` hardcode that already matches the chosen scope. `onViewDetails`
already does exactly "open this session's detail in place" (`setIsDiscoverModalOpen(false);
setSelectedSessionId(sessionId)`). So `<UpcomingMatches onSelectMatch={...}>` on each page just
switched from `(sessionId) => navigate('/matches?session=' + sessionId)` to
`discoverModalData.onViewDetails` directly — one line per page
(`HomeFeedPage.tsx`/`GroupsPage.tsx`/`FriendsPage.tsx`), no new hook, no new state.
`useDiscoverModalData.ts`'s doc comment updated: its `canManage: false` hardcode used to be
justified purely by "Discover excludes self-created sessions" — now also serves a call path
(the rail) where that's no longer structurally true, so the comment now says this is a deliberate
scope choice for both paths, not just an incidental fact about Discover.

**Tests:** `e2e/flows/home-feed-journey.spec.ts` step 6 rewritten (asserted a URL change +
redirect before; now asserts the dialog opens with no URL change, then closes it). No component
test previously asserted the old navigation behavior, so nothing else needed updating.
`pnpm exec tsc -b` clean, `pnpm lint` clean, `pnpm exec vitest run` for the affected areas: 425/425
passing (`HomeFeedPage.test.tsx`, `GroupsPage`/`FriendsPage`/`session` directories,
`UpcomingMatches.test.tsx`).

## Bug fix (2026-08-13, same day, found live testing the above)

**Symptom (user-reported):** with zero sport profiles, clicking the rail's "Join a match" →
`AddSportModal` gate → add a sport succeeds → the Discover panel appears but shows **0 sessions**
(1 expected). Closing the modal and clicking "Join a match" again shows the session correctly.

**Root cause:** `GET /sessions/discover` (`useDiscoverSessions.ts`) is gated server-side to sports
the caller holds an active profile for (`SessionServiceImpl.discoverSessions` —
`effectiveSportIds.isEmpty()` short-circuits to `Page.empty()`). The Discover modal's own query
fires as soon as it opens (`enabled: isDiscoverModalOpen`), *before* the caller has any profile —
caching an empty result under `sessionKeys.discover(sportId)`. `useAddSportProfile`'s mutation
only ever invalidated the sport-profiles query, never the discover-sessions one, so that empty
cache entry just sat there stale after a profile was added — nothing re-triggered a refetch while
the modal stayed open. Closing and reopening toggles the query's `enabled` flag off then on,
which forces a fresh fetch (default `staleTime: 0`) — that's why it "fixed itself."

**Fix:** `useAddSportProfile.ts`'s `onSettled` now also invalidates every `sessionKeys.discover(*)`
cache entry (partial key, no `sportId` suffix, so it catches every scoped variant at once) —
adding a sport profile can make previously-hidden sessions discoverable, so this query is exactly
as sport-profile-dependent as the profiles query itself and needed the same invalidation. Scoped
to `useAddSportProfile` (not a one-off patch inside `SessionDiscoverModal`) since every caller of
this mutation — `SportSwitcher`'s "+" pill, `CreateSessionModal`'s own zero-sport gate, the
Matches page's auto-prompt — has the identical staleness exposure, not just this one modal.

**Tests:** new case in `useAddSportProfile.test.tsx` seeding a stale empty `sessionKeys.discover`
cache entry and asserting it's invalidated after the mutation settles.
`pnpm exec vitest run src/shared/hooks/useAddSportProfile.test.tsx src/features/session`:
151/151 passing. `tsc -b`/`lint` clean.

## Delta (2026-08-13, same day, reverses the earlier "view + Join/Leave only" scope choice)

**User-reported gap:** the rail's in-place modal (see the "View details" delta above) didn't show
"Waiting for approval" for a session the caller actually manages, even though the same session's
approval queue renders correctly from the Matches page. This was the direct, expected consequence
of the earlier scope decision (`canManage` hardcoded `false` in `useDiscoverModalData`) — but once
seen live, the user asked to reverse it: the rail's modal should have full manager parity with the
Matches page after all (Cancel session + the approval queue, when the caller manages that
session), not just view + Join/Leave.

**What changed:** extracted the full `SessionDetailModal` data slice — session/participants
queries, real `canManage` (creator for standalone, owner/admin role for group-linked, resolved
from `useUserGroups`), join/leave/cancel, the canManage-gated approval queue, likes, and the
Discussion section — out of `useMatchesPageData.ts` into a new shared hook,
`useSessionDetailModalData(sessionId)`. Both `useMatchesPageData` (the Matches page's own detail
dialog) and `useDiscoverModalData` (the rail/Discover-modal's detail dialog, on Home Feed/Groups/
Friends) now call this one hook instead of maintaining two near-duplicate implementations —
`useDiscoverModalData`'s old hardcoded `canManage: false` and inert cancel/approval stubs are
gone entirely. A genuine Discover-sourced session still resolves `canManage: false` correctly
(unchanged — `GET /sessions/discover` still excludes sessions the caller created), but a
rail-sourced session (reached via the same `onViewDetails`, not through Discover's own grid) now
resolves real ownership/role instead of being hardcoded false.

**Renamed:** `useMatchesPageData`'s `canManageSelected` field is now `canManage` (matching the
shared hook's naming and `useDiscoverModalData`'s existing convention) — `MatchesPage.tsx` and
`useMatchesPageData.test.tsx` updated. `currentUserId` needed a small subtlety: the shared hook
falls back to `''` (matching `SessionDetailModal`'s prop convention), but `MatchesPage.tsx` also
uses the raw value for `useAddSportProfile(data.currentUserId)`, which specifically needs
`undefined` (not `''`) to mean "no user yet" — `useMatchesPageData` now spreads the shared hook's
data first, then re-adds its own raw `currentUserId` last to override that fallback for its other
consumers.

**Tests:** existing `SessionDetailModal.test.tsx`/`useMatchesPageData.test.tsx` coverage already
exercised `canManage`/approval-queue behavior through the (now-shared) logic, so no new test
scenarios were needed — just the `canManageSelected` → `canManage` rename in two assertions.
`pnpm exec tsc -b` clean, `pnpm lint` clean, `pnpm exec vitest run` for the affected areas
(`session`/`home-feed`/`groups`/`friends`/`shared` directories): 594/594 passing. Full suite:
823/823 passing (one run hit 10 pure worker-startup timeouts under heavy sandbox load — confirmed
infrastructure flakiness, not real failures, by re-running those 10 files in isolation: 36/36
passing).

## Bug fix (2026-08-13, found live via `home-feed-journey.spec.ts` step 6)

**Symptom (user-reported):** `e2e/flows/home-feed-journey.spec.ts` step 6 (the rail's in-place
"View details" delta above) failed with `locator.click: Test timeout of 30000ms exceeded` /
`element is outside of the viewport` clicking the modal's Close button. Not reproducible in this
sandbox at first — Playwright couldn't get past login at all, traced to `reuseExistingServer:
true` silently reusing the user's own persistent dev server on :5173 (wired to the real backend
on :8080, not the mock server), unrelated to the actual bug. Re-ran against isolated ports
(9877/5199) via a temporary Playwright config to get a clean reproduction.

**Root cause:** `DialogContent` (`shared/ui/dialog.tsx`) positions an anchored modal at
`top: anchorBottom + ANCHOR_GAP_PX`, where `anchorBottom` (`shared/lib/modalAnchor.ts`'s
`useAnchorBottom`) is the sport switcher's `getBoundingClientRect().bottom` — correctly
viewport-relative, so it goes **negative** once the switcher scrolls above the viewport. The
value was used unclamped, so a `position: fixed` modal opened after the page had scrolled past
its anchor rendered entirely above the visible viewport (Close button included) — confirmed via
a diagnostic screenshot: the modal was genuinely present in the DOM, `top: -137px`, ~450px above
the visible area. Not `SessionDetailModal`- or CLIENT-SESSION-9-specific — any modal on any
`ModalAnchorProvider` page (Home Feed/Groups/Friends), opened after the anchor scrolls out of
view, hits this. CLIENT-SESSION-9's rail-modal delta just opened the first code path that reaches
"open an anchored modal without a full page navigation resetting scroll to 0 first" — in this
spec, clicking the Trending card's hashtag row (step 5c) scrolls the page via Playwright's normal
scroll-into-view-before-click behavior (page taller than the 720px test viewport), and the scroll
position persists after that dialog closes.

**Fix — reasoned through 3 options with the user before implementing:**
1. *Clamp `top` to a minimum* (`Math.max(anchorBottom + GAP, MARGIN)`) — smallest patch, but the
   modal ends up pinned near the viewport top with no visual connection to anything.
2. ***Chosen:*** *fall back to the existing centered layout* (the same one already used when
   `anchorBottom === null`) whenever the anchor isn't currently within the viewport
   (`anchorBottom > 0 && anchorBottom < window.innerHeight`) — reuses an already-correct,
   already-shipped code path instead of inventing a new "pinned near top" state, and doesn't move
   the page.
3. *Scroll the anchor back into view before opening* — rejected: visible scroll-jump right as the
   modal opens, needs open/scroll timing coordination, touches every call site that opens an
   anchored modal.

`shared/ui/dialog.tsx`: replaced the `anchorBottom !== null` branch condition with a new
`anchored` boolean (`anchorBottom !== null && anchorBottom > 0 && anchorBottom < window.innerHeight`)
used everywhere `anchorBottom === null` was previously checked. The `anchorBottom > window.innerHeight`
half of the check (anchor pushed *below* the viewport) is included for completeness but not
reachable in practice today — the sport switcher/group pill row sit at the top of the page layout
and can only scroll up, never down, from their initial position.

**Tests:** new `shared/ui/dialog.test.tsx` (this component had no direct tests before) — anchored
positioning when the anchor is in-viewport, falls back to centered when the anchor's bottom edge
is negative (the regression case) or exceeds `window.innerHeight`, and falls back to centered when
there's no anchor at all (unchanged prior behavior). Verified end-to-end against the original
failure: re-ran `home-feed-journey.spec.ts` against the fix (now passing) and the **full e2e
suite** (49/49 passing, including `matches-journey.spec.ts`) via the same isolated-port diagnostic
setup. `pnpm exec tsc -b` clean, `pnpm lint` clean, `pnpm exec vitest run` full suite: 827/827
passing (121 files, up from 823/120 — the 4 new dialog tests).

---

### CLIENT-SESSION-9 · Wire Join/Accept/Decline/Cancel/Leave button on session card + Session Detail modal
**Status:** `DONE` (2026-08-13) · **Type:** Feature · **Dependency:** SESSION-9
(`modules/session/docs/BACKLOG_MVP.md`, backend, `DONE`) · **Filed:** 2026-08-08 · **Backend
summary:** `modules/session/docs/MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md`

**What ships:** the session card (Discover, Upcoming rail, `/sessions/mine` results) and
`SessionDetailModal` both resolve their action button from `SessionResponse.callerParticipation`
(now returned by every session endpoint) instead of only checking for a `JOINED` row:
- no row, or `LEFT` → **Join** button (`POST /sessions/{id}/join`)
- `INVITED` → **Accept** (`POST /sessions/{id}/join` — an invitee's own join call always resolves
  straight to `JOINED`) and **Decline** (`DELETE /sessions/{id}/leave`)
- `REQUESTED` → **Cancel** (`DELETE /sessions/{id}/leave`) — no "waiting for approval, disabled"
  state; cancelling is a real action
- `JOINED` → **Leave** (`DELETE /sessions/{id}/leave`)

Decline and Cancel both call the same `DELETE /sessions/{id}/leave` endpoint Leave already uses —
no new endpoint on the backend side, just a different button label/icon depending on
`callerParticipation.status`.

**Explicitly out of scope:** the invite-friend search + multi-select and approval-queue UI for
reviewing *other* users' `REQUESTED` rows (`CLIENT-SESSION-4`, already `DONE`); anything on
`getSessionParticipants` (unchanged by SESSION-9, not part of this ticket).

**Delta (2026-08-13, at pickup):** the card's own action button shows one action only —
Accept-only for INVITED, not Accept+Decline — user decision at pickup (3 layout options presented
with previews; picked "View details + one action button", Decline stays inside
`SessionDetailModal` only, to avoid a 3rd button on a compact card, especially the narrower
`UpcomingMatches` rail card). Card restructured from a single full-card `<button>` into two
sibling buttons, which broke every existing e2e/component-test selector that opened a card by
title-only regex (both buttons' `aria-label`s now contain the title) — fixed across
`matches-journey.spec.ts` and 6 component test files; see
`client/docs/CLIENT-SESSION-9_PARTICIPATION_ACTION.md` for the full list. E2E could not be run
live in this sandbox (confirmed pre-existing: an unmodified spec fails identically) — verified via
full static review + `tsc`/`lint`/unit-test suite instead.

**Delta (2026-08-13, same day, user-reported):** the Upcoming rail's "View details"
(`UpcomingMatches`, on Home Feed/Groups/Friends) used to navigate to `/matches?session={id}`,
switching the user away from whatever page they were on — user flagged this as unwanted. Fixed to
open `SessionDetailModal` in place instead, reusing each page's existing
`discoverModalData.onViewDetails` (already wired for the Discover flow's own "View details"
clicks) — turned out to need one line changed per page, no new hook. Scope confirmed with the
user: applies to all three rail-hosting pages, and the in-place modal is view + Join/Leave only —
no Cancel session / approval queue even for a session the caller manages (a rail session,
unlike a Discover-sourced one, genuinely can be self-managed; full manager parity stays reachable
only via "See all" → the Matches page). `home-feed-journey.spec.ts` step 6 rewritten to assert
no URL change instead of a redirect to `/matches`.

**Delta (2026-08-13, same day, reverses the above):** user saw the gap live (approval queue
missing from the rail's modal for a session they manage, working correctly from Matches) and
asked for full manager parity after all. `canManage`/cancel/approval-queue logic extracted out of
`useMatchesPageData` into a new shared `useSessionDetailModalData(sessionId)` hook — both
`useMatchesPageData` and `useDiscoverModalData` (the rail/Discover modal's detail slice) now use
it, replacing `useDiscoverModalData`'s old hardcoded `canManage: false`. See
`client/docs/CLIENT-SESSION-9_PARTICIPATION_ACTION.md`'s own delta section for the full writeup.
