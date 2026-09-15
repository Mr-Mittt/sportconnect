# CLIENT-SESSION-21 · PREPARING-session warning + completion UI

**Status:** `DONE` (2026-09-14)
**Type:** Client feature
**Depends on:** backend **SESSION-24** — hard.
**Filed:** 2026-09-14, companion to SESSION-24. Notable finding at scoping time: there is **no
edit-session UI at all today** — `useUpdateSession.ts` exists but is unconsumed ("No edit UI
consumes this yet... provided for a follow-up edit-UI ticket to build against"), so this ticket is
the first thing to build against it, scoped narrowly to the `PREPARING`-completion case rather than
a general session editor.

## Scope

1. `CreateSessionModal`: when location and/or fee are left blank at submission (now optional per
   SESSION-24), show a warning (exact copy/placement TBD at pickup) that the session will be
   created as `PREPARING` and needs completing before its start time, or it will be auto-cancelled.
2. A minimal "complete session setup" surface for a `PREPARING` session the caller created —
   likely a banner/section in `SessionDetailModal` (creator-only, shown only when
   `session.status === 'PREPARING'`) with inputs for whichever of location/fee is still missing,
   submitting via the existing (currently unconsumed) `useUpdateSession` hook. Exact placement/
   component shape TBD at pickup — no prior "edit session" UI pattern exists to follow.
3. After a completion update that still leaves one field missing (partial completion — SESSION-24
   keeps the session `PREPARING` until both are set), re-show the same warning reflecting what's
   still outstanding.
4. **Add `PREPARING` to `client/src/shared/types/session.ts`'s `SessionStatus` union**, and fix the
   two call sites that would otherwise silently misbehave (found during SESSION-24's `/workon`
   Phase 1 client-visible-enum check, not caught by the compiler since neither site is an
   exhaustive switch):
   - `SessionDetailModal.tsx`'s `canJoinOrLeave` (`status === 'SCHEDULED' || status === 'ONGOING'`)
     — must include `'PREPARING'`, since SESSION-24 spec's it as fully joinable like `SCHEDULED`.
     Omitting it would hide the Join button on a joinable session.
   - `groupSessionsByDate.ts`'s `ACTIVE_STATUSES` Set (`SCHEDULED`/`ONGOING`) — must include
     `'PREPARING'`, otherwise a session still being set up falls into the "history" zone
     (CLIENT-SESSION-20) instead of "active".

5. **Add `'session.details.updated'` to the `NotificationType` union** (`client/src/features/notifications/types.ts`)
   and a `getNotificationText` case (`client/src/features/notifications/notificationText.ts`):
   `[actor, plain(' updated '), entity]` (same shape as `session.participant.joined`/`left`) —
   deliberately field-agnostic, matches the backend event's own design (SESSION-24). Compiler-
   enforced (CLIENT-NOTIF-4's exhaustiveness check) — omitting the union member entirely avoids
   the build error but silently degrades to the generic fallback text, the exact gap CLIENT-NOTIF-3
   already fixed twice; don't repeat it a third time.

6. **`client/src/shared/types/session.ts`'s `Session.location`/`.feeType` become nullable**
   (`Location | null` / `FeeType | null`, matching the existing `feeAmountVnd: number | null`
   pattern) — a `PREPARING` session's `SessionResponse.location`/`.feeType` are genuinely `null`
   backend-side (found during SESSION-24's Phase 4 consumer census: neither Java field carries
   `@NotNull`, so nothing stops a `PREPARING` row's response from actually having `null` there).
   Audit every read of `session.location.*`/`session.feeType` across `src/features/session/` and
   `src/shared/components/UpcomingMatches.tsx` for a null-safe guard.

**Scope change (2026-09-14, at SESSION-24 pickup):** items 4-6 added — originally this ticket only
covered the warning/completion UI; the `SessionStatus` union + the two call sites (item 4), the new
`session.updated` notification type (item 5), and the now-nullable `location`/`feeType` fields
(item 6) were found missing coverage during SESSION-24's Phase 1/3/4 client-visible-enum and
consumer-census checks, and folded in here rather than filed separately, since they're all the same
"the client needs to know about PREPARING/its update path" concern.

**Out of scope:**
- A general session editor for already-`SCHEDULED` sessions — SESSION-24 makes `locationId`/
  `feeType` immutable outside `PREPARING` anyway, so no such editor is implied by this ticket.
- SESSION-25/CLIENT-SESSION-22's search/filter work.

**Tests:** Vitest for the warning component (missing-location / missing-fee / missing-both
states) and the completion form; a `notificationText.test.ts` case for `session.updated`; MSW
handler for a `PREPARING` session fixture + the update flow; `matches-journey` (or a new) e2e
covering create-without-location → warning → complete → status becomes `SCHEDULED`.

**Delta (2026-09-14, at pickup):** item 4's first bullet named the wrong file. `SessionDetailModal
.tsx`'s `canJoinOrLeave` only gates the "Waiting for approval" section, not the participation
buttons — the actual Join/Accept/Cancel/Leave gate is `shared/lib/sessionParticipation.ts`'s
`getParticipationAction`, which had the exact same stale `'SCHEDULED' | 'ONGOING'` check (used by
both `SessionCard` and `SessionDetailModal`). Built as three sites, not two: `getParticipationAction`
(the real button gate), `canJoinOrLeave` (as originally scoped, for the approval queue), and
`ACTIVE_STATUSES`. Also found and fixed 4 read sites needing a null guard for the new nullable
`location`/`feeType` (item 6) beyond the two the scope text named:
`shared/lib/feeType.ts`'s `formatFeeDisplay`, `SessionDetailModal.tsx`, `shared/components
/SessionCard.tsx`, and `discoverSearch.ts` — `UpcomingMatches.tsx` itself has no direct read (it
renders through `SessionCard`).

## What was built

Built as scoped, items 1-6, plus the corrections above:

- **Types** — `SessionStatus` gains `PREPARING`; `Session.location`/`.feeType` become nullable;
  `CreateSessionPayload.locationId`/`.feeType` become optional.
- **Compiler-enforced maps/gates** — `SESSION_STATUS_LABEL`/`SESSION_STATUS_CLASSES` gain a
  `PREPARING` entry (amber, the app's reserved warning color); `getParticipationAction`,
  `canJoinOrLeave`, and `ACTIVE_STATUSES` all gain `PREPARING`.
- **Null-safety** — the 4 sites above guard `location`/`feeType`, rendering "Location pending"/
  "Fee pending" where relevant.
- **`CreateSessionModal`** — Location and Fee both lose their required-ness (Location had none
  before; Fee's `FeeType` state starts `undefined` instead of defaulting to `FREE`). A new amber
  informational banner (`willBePreparing`) explains the PREPARING outcome — distinct from the
  existing red per-field required errors, since leaving these two blank is now a valid choice, not
  a mistake. **Delta (2026-09-14, user feedback after initial ship):** the banner moved from the
  scrollable body into the footer, to the left of "Create session" (`flex-1` + `justify-end` on
  the footer row), so it stays visible regardless of scroll position rather than needing the form
  scrolled to the bottom. Each fee checkbox (and the amount input) also gained un-select: clicking
  an already-checked `Free`/`Split cost` checkbox, or clearing the amount back to empty, now calls
  `onChange(undefined)` instead of re-selecting the same value — the only way back to "nothing
  picked" once one of the three has been chosen (`FeeTypeFields`'s `onChange` signature widened to
  `FeeType | undefined`). This made the pre-existing "Amount is required." validation branch
  unreachable (`FIXED` now can't exist with an empty amount — the two are set together), so it and
  the now-always-true `isValid` sub-check were removed rather than left as dead code. `FeeTypeFields`
  (+ its digit-input helpers) extracted into its own file (`components/FeeTypeFields.tsx`) so the
  completion UI below can reuse it verbatim.
- **`SessionPreparingCompletion`** (new) — renders only whichever of location/fee is still
  missing; the location control opens the same `LocationPicker` component `CreateSessionModal`
  uses (a fresh instance, no favorites dropdown — kept deliberately minimal, per the ticket's own
  scoping note that no prior "edit session" pattern exists); the fee control is the shared
  `FeeTypeFields`. Submits only the field(s) actually being completed, never re-sending one the
  session already has. Its own "Still missing: …" text doubles as item 3's re-shown warning after
  a partial completion — no separate banner needed, since the component already knows exactly
  what's still missing from `session.location`/`.feeType` on every render.
- **`useSessionDetailModalData`** — gains `useUpdateSession()` + a `useLocationPickerData` slice
  scoped to the session's own (already-known) `sportId`, real favorites wiring (reused
  `useFavoriteLocation(s)`/`useUnfavoriteLocation`, matching `useCreateSessionModalData`'s
  pattern rather than a fake inert heart icon), and `resetActionErrors` now also clears the
  completion mutation/selection on dialog close (CLIENT-MODAL-1's same stale-error reasoning).
  `SessionDetailModal.tsx` renders `SessionPreparingCompletion` when `canManage && session.status
  === 'PREPARING'`; the 6 new props were threaded through all 6 render sites (`HomeFeedPage`,
  `GroupsPage`, `FriendsPage`, `ProfilePage`, `MatchesPage`, `AppShell`) — each wires explicit JSX
  props today, not a spread, so each needed the edit by hand. `canManage` itself was previously an
  unused prop in this component (the Cancel-session button that used to consume it was removed
  post-ship, CLIENT-SESSION-10) — this ticket is what makes it live again.
- **Notification** — `session.details.updated` added to `NotificationType` +
  `getNotificationText` (`[actor, ' updated ', entity]`). No navigation change needed —
  `useNotificationBellData` routes by `entityType`, not by `type`.
- **MSW** (`e2e/mocks/handlers/sessions.ts`) — `POST /api/sessions` accepts a missing
  `locationId`/`feeType`, landing the created session `PREPARING` with `location`/`feeType` both
  `null`, mirroring `SessionServiceImpl.createSession`. `PUT /api/sessions/:sessionId` rewritten:
  the old handler naively spread `Partial<Session>` onto the existing row, which never actually
  applied a `locationId` update at all (the payload's `locationId` number was merged onto a field
  the `Session` type doesn't have — `location` stayed untouched) and had no PREPARING-only gate.
  Now typed as the real `UpdateSessionPayload` shape, rejects (400) touching `locationId`/`feeType`
  while not `PREPARING`, resolves `locationId` into the fixture `Location` object, and flips to
  `SCHEDULED` once both are present — mirroring SESSION-24's `updateSession` rule 10.
  **No static `PREPARING` fixture is seeded** into the default session list (unlike every other
  status) — `UpcomingMatches`' rail caps at `maxVisible=4`, and an 8th standalone session would
  risk silently displacing a session another e2e journey (home-feed/groups/friends/profile)
  expects to see. The e2e coverage below creates its PREPARING session live instead.
- **E2E** — `matches-journey.spec.ts` gained step 11: create without location/fee → the Preparing
  banner shows → submit → detail modal shows status "Preparing" and `SessionPreparingCompletion`
  naming both fields missing → complete the location via its own `LocationPicker` trigger → check
  "Free" → Save → status flips to "Scheduled". Step 6 (an existing create-session step) now checks
  "Free" explicitly, since Fee no longer defaults to it — without that change, that step's session
  would have silently become `PREPARING` instead of `SCHEDULED`, which wasn't what that step was
  testing.

## Verification

- `tsc -b --noEmit`: clean.
- `eslint src e2e --max-warnings 0`: clean (one pre-existing, unrelated warning in
  `SessionStartTimePicker.tsx`, confirmed via `git diff` to predate this change).
- Vitest: full suite 181 files / 1333 tests green — 1 new file (`SessionPreparingCompletion
  .test.tsx`, 9 tests after the un-select addition) plus updated `CreateSessionModal.test.tsx`,
  `SessionDetailModal.test.tsx`, `groupSessionsByDate.test.ts`, `notificationText.test.ts`.
- **e2e**: `matches-journey.spec.ts` (3 tests, including the new step 11) green in isolation and
  as part of the full `e2e` project run (83 passed). The `ws proxy ECONNABORTED` lines in the
  output are the documented chat-websocket parallel-load noise (CLAUDE.md/CLIENT-NOTIF-3's
  precedent), not a failure.
- **Visual-regression expectation**: `app-create-session-modal.spec.ts` baselines legitimately
  change (removed required asterisks + "(optional)" labels, the new Preparing footer banner) —
  expected to fail until `/updatebaseline` regenerates exactly those files. `app-session-detail
  -modal.spec.ts` was *originally* predicted to change too (the new completion section, the
  Preparing status color) — **corrected at `/updatebaseline` time**: none of that spec's 7 existing
  states (not-joined/already-joined/invited/requested/approval-queue/discussion/cancelled) ever
  render a `PREPARING` session with `canManage`, so `SessionPreparingCompletion` never actually
  appears in any of them — this ticket only added Storybook/Vitest coverage for it, never a
  `visual-regression` Playwright case. **CLIENT-SESSION-23 gets a note to add one.** Confirmed via
  stash-and-rerun: the full `visual-regression` project fails identically (111 failed) on clean
  `master` with none of this ticket's changes applied, matching the documented Windows
  font-rendering noise floor — so every baseline failing alongside `create-session-*` is that same
  noise, not a regression, and cannot be regenerated on this Windows host.
- **Executed** (2026-09-15, `/updatebaseline`): applied the `client-ci` `update-baselines` dispatch
  artifact. SHA-256 comparison against the committed set confirmed **exactly 9 files changed**
  (`create-session-{default,location-chosen,session-detail-ref}-{375,768,1280}.png`), 0 new, 0
  missing, and the other **102 baselines came back byte-identical** — confirming the local Windows
  noise floor was pure noise, not a masked regression. Human-checked one breakpoint per changed
  state: the "(optional)" labels and the amber Preparing banner render correctly and stay visible
  in the scrolled `session-detail-ref` state (footer-pinned, as designed). Committed
  `7a3f7c3` on `feature/client-session-21-preparing-warning-completion`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
