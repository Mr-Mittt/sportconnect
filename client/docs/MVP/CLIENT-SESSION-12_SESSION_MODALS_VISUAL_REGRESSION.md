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

**Real flakiness found and fixed** (same general class as GRP-10's, but a different mechanism):
consecutive local runs occasionally showed a tiny (~0.01 pixel ratio) diff, traced to a focused
text input's blinking caret rendering differently between the baseline capture and a later
comparison run. Fixed by blurring `document.activeElement` right before every screenshot in both
spec files. This eliminated the flakiness entirely for `SessionDetailModal` (stable across 3
consecutive re-runs) and reduced `CreateSessionModal`'s from "every run" to "~1 in 3, at 768px
only" — the residual level matches this suite's own already-documented, already-accepted
Windows-font-rendering noise threshold (0.01–0.04 ratio, per `app-home-feed.spec.ts`'s own comment
and `E2E_OVERVIEW.md` §6), not a new problem introduced here.

**Baselines — Windows-rendered locally, need the `client-ci` `update-baselines` dispatch swap**
(same bootstrap step GRP-10/HF-10b/SPORT-4 all needed, same reason: triggering a GitHub Actions
`workflow_dispatch` isn't possible from this environment) before CI's real Linux runs of these two
specs will pass clean.

**Verification:** `pnpm exec tsc -b` clean, `pnpm exec eslint .` clean (0 errors — 2 pre-existing
warnings in an unrelated file), full `pnpm exec vitest run` green (this ticket adds no unit-tested
code, so this just confirms nothing else broke — the 3 new fixtures are additive-only and don't
touch any existing fixture object other specs depend on). `client/docs/E2E_OVERVIEW.md` updated
(§3 directory listing + two new §6 catalog entries).
