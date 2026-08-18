# CLIENT-SESSION-12 · Visual regression harness for `SessionDetailModal` and `CreateSessionModal`

**Status:** `DONE`
**Type:** Infrastructure (Testing)
**Depends on:** none (both modals already `DONE` — `SessionDetailModal` via CLIENT-SESSION-9/10/11,
`CreateSessionModal` via CLIENT-SESSION-2/3/4/5)
**Filed:** 2026-08-18, closing a gap `CLIENT-SESSION-10` explicitly flagged: *"no session-modal
visual-regression spec exists to regenerate"* (noted while regenerating the 9
`app-post-modal.spec.ts` baselines for an unrelated height/send-icon change) — filed now rather than
left as a loose note in that ticket's file. User decision at filing: covers both session-related
dialogs, not `SessionDetailModal` alone.

Adds `visual-regression` Playwright coverage for both modals, matching `app-post-modal.spec.ts`
(FEED-11)'s harness shape: dialog-scoped screenshots (`page.getByRole('dialog')`, not full-page —
same reasoning FEED-11 used, the dimmed backdrop is already covered by whichever page's own
full-page spec), across the standard 3 breakpoints, Linux-rendered baselines via the `client-ci`
workflow's `update-baselines` dispatch.

Two dialogs, likely two spec files or two grouped describe blocks (decide at pickup which fits this
repo's existing spec-per-file convention better) — `SessionDetailModal` has materially more visual
states than `CreateSessionModal` (participant-status-driven button variants from CLIENT-SESSION-9,
the comments section from CLIENT-SESSION-8, the UX/UI pass from CLIENT-SESSION-10) vs.
`CreateSessionModal`'s form-field states (capacity/fee from CLIENT-SESSION-3, invite/approval from
CLIENT-SESSION-4, favorites dropdown from CLIENT-SESSION-5). Exact state/breakpoint set is a Phase 3
design decision at pickup, not predetermined here.

**Out of scope:** any new functionality in either modal — this is baseline coverage for already-shipped
behavior, not a design or behavior change.

**Tests:** the spec itself *is* the test — no separate unit/component test coverage implied by this
ticket.

---

## Implementation

**Two spec files** (matches this repo's existing spec-per-file convention, e.g.
`app-home-feed.spec.ts` vs `app-groups.spec.ts`): `client/e2e/visual/app-session-detail-modal.spec.ts`
(7 states) and `client/e2e/visual/app-create-session-modal.spec.ts` (3 states). Both dialog-scoped
(`page.getByRole('dialog')`, not full-page), same shape as `app-post-modal.spec.ts`. 10 states × 3
breakpoints = 30 baselines.

**States chosen** (curated from `SessionDetailModal`'s 20 Storybook stories and
`CreateSessionModal`'s 8 — the full set would have been excessive; many stories are subtle prop
variants, e.g. fee type, capacity, like count, already human-reviewed in Storybook, not worth a
dedicated baseline):

| Modal | State | Setup |
|---|---|---|
| Detail | `not-joined` | `mockDiscoverableSession`, View details |
| Detail | `already-joined` | `mockGroupSession`, live Join click, View details |
| Detail | `invited` | `mockInvitedSession` (new fixture), View details |
| Detail | `requested` | `mockRequestedSession` (new fixture), View details |
| Detail | `approval-queue` | `mockOwnedGroupSession` ("Ladder night"), View details |
| Detail | `discussion` | `mockSession` (pre-seeded comment), View details |
| Detail | `cancelled` | `mockCancelledSession` (new fixture), View details |
| Create | `default` | Open "Create session" |
| Create | `location-chosen` | Open, LocationPicker search + select (real recipe from `matches-journey.spec.ts`) |
| Create | `no-sport-profiles` | `seedZeroSportProfilesOnNextLoad` + open |

**Real findings during Phase 2 exploration that reshaped the plan:**
1. **`SessionDetailModal`'s Cancel session button was removed entirely** (per `matches-journey.spec.ts`'s
   own comment, CLIENT-SESSION-10 user decision) — there is no live UI path left to reach a
   `CANCELLED` session from a fresh `SCHEDULED` one.
2. **This mock backend has no second live identity** — every session mockUser could join has
   `autoApprove: true` (so joining always resolves straight to `JOINED`, never `REQUESTED`), and
   mockUser can never be someone else's invitee (only the creator side is simulated). So mockUser's
   own `INVITED`/`REQUESTED` states aren't reachable via any live click sequence either.

**3 new MSW fixtures added** (`mockInvitedSession`/`mockUserInvitedRow`,
`mockRequestedSession`/`mockUserRequestedRow`, `mockCancelledSession`) to close both gaps — pure
seed data, zero app-code change, same "pre-seed the other side" precedent already established by
`mockSessionJoinRequest`/`mockSecondSessionJoinRequest` for the approval-queue state. Both new
sessions are group-linked to `mockGroup` (mockUser is already a member there) rather than
standalone, so they surface in "My sessions" via the group-sessions query (no status filter),
unlike `/sessions/mine` (creator-only) or the joined-sessions query (`JOINED`-only) — neither of
which would have shown an `INVITED`/`REQUESTED`-only session. User confirmed this approach
up front, flagged as a real scope expansion beyond pure state selection before implementing.

**Two real bugs found and fixed, one residual class correctly left alone:**
1. `page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())` — a genuine
   `tsc -b` failure (`Cannot find name 'document'`), since `e2e/**/*.ts` is covered by
   `tsconfig.node.json`'s `lib: ["ES2023"]`, no DOM — exactly why the pre-existing
   `document.fonts.ready` call elsewhere in this suite is always a **string** argument, not an
   arrow function. Fixed by matching that same string-argument convention
   (`page.evaluate('document.activeElement && document.activeElement.blur()')`) — a real gap in
   my own Phase 5 verification, since Playwright's own test runner (esbuild-transpiled, no strict
   typecheck) never caught it; only a direct `tsc -b` run did, and I hadn't re-run one after
   adding the blur call until asked to check the broader e2e suite.
2. A focused text input's blinking caret was a real, fixable flakiness source (traced live,
   confirmed fixed) — blurring the active element before every screenshot removed it.
3. **What's left (~1 in 6 local runs, always a ~0.01 pixel ratio, 2–4 pixels) is not a bug** —
   reproduces even under `--workers=1` (rules out parallel-worker contention), matches this
   suite's own already-documented, already-accepted Windows-font-rendering noise threshold
   (0.01–0.04 ratio, per `app-home-feed.spec.ts`'s own comment and `E2E_OVERVIEW.md` §6) exactly.
   CI's Linux render is authoritative; further local iteration on this specific class isn't
   productive, per this suite's own established stance.

**Baselines — Windows-rendered locally, need the `client-ci` `update-baselines` dispatch swap**
(same bootstrap step GRP-10/HF-10b/SPORT-4 all needed, same reason: triggering a GitHub Actions
`workflow_dispatch` isn't possible from this environment) before CI's real Linux runs of these two
specs will pass clean.

**Cross-ticket ripple, found by actually running the `e2e` project (not just the new specs) —
confirmed and fixed, user-approved before proceeding:** `mockInvitedSession`/`mockRequestedSession`
are group-linked to `mockGroup` with `status: SCHEDULED` (the only way to make them reachable via
"View details" on the Matches page at all — `useMySessions`/`useJoinedSessions` both explicitly
exclude an `INVITED`/`REQUESTED`-only session). But `useUpcomingMatches` — the hook behind the
"Upcoming" rail on **Home Feed, Groups, and Friends pages** — reads from that identical
`useGroupSessionsForGroups` query, filtered only to `SCHEDULED`/`ONGOING`. So both new fixtures now
legitimately count as "upcoming" everywhere that rail renders (capped at `UpcomingMatches`' own
`maxVisible=4`) — correct real app behavior (a user invited to a group session should see it in
their rail), but it broke `home-feed-journey.spec.ts`'s hardcoded rail-count assertions (3→4) and
made GRP-10's already-merged baselines (`groups-*.png`) stale, since that page renders the same
rail. Fixed both: updated `home-feed-journey.spec.ts`'s two affected counts (with an explanatory
comment matching that file's own established history-of-changes convention) and
`E2E_OVERVIEW.md`'s §6 catalog entry for it; regenerated all 18 of GRP-10's baselines locally
(verified via visual diff — the new "Tuesday drop-in" session with its Accept button now correctly
appears in the rail) — **these also need the same `update-baselines` dispatch swap** before
merging, on top of this ticket's own 30 new ones. `matches-journey.spec.ts` was unaffected (asserts
specific named sessions, not rail totals).

**Verification:** `pnpm exec tsc -b` clean (caught the real `document.evaluate` DOM-lib bug above),
`pnpm exec eslint .` clean (0 errors — 2 pre-existing warnings in an unrelated file), full
`pnpm exec vitest run` green (878/878 — this ticket adds no unit-tested code, so this just confirms
nothing else broke), **full `pnpm exec playwright test --project=e2e` run (51 specs) — 50 passed,
1 pre-existing failure** (`friends-journey.spec.ts`'s "accepting an incoming request" step — fails
consistently in this environment both before and after every change in this ticket; the failing
locator/fixture (`Hana Kim`, Friend Requests) shares nothing with anything this ticket touched,
confirmed by grep; not fixed, out of scope). `client/docs/E2E_OVERVIEW.md` updated (§3 directory
listing + two new §6 catalog entries + the `home-feed-journey.spec.ts` count-fix entry above).
