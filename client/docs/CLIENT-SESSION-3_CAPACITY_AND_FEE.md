# CLIENT-SESSION-3 — Capacity + Fee/Pricing Fields in `CreateSessionModal`

**Status:** DONE (2026-08-03)

## Scope (approved plan)

Backend contract: `modules/session/docs/SESSION-5_CAPACITY_AND_FEE.md` (`DONE`, 2026-08-02) — `Session`
gained `capacity` (`Integer`, informational only, never enforced by `joinSession`), `feeType`
(`FREE`/`SPLIT`/`FIXED`), `feeAmountVnd` (meaningful only when `feeType` is `FIXED`). Both `capacity`
and `feeType` are mandatory on `CreateSessionRequest` — no default fallback.

Approved plan:
1. **Types** — `FeeType` on `shared/types/session.ts`'s `Session`; `capacity`/`feeType`/(optional)
   `feeAmountVnd` added to `CreateSessionPayload`/`UpdateSessionPayload`.
2. **New shared lib helpers** — `shared/lib/feeType.ts` (`FEE_TYPE_LABEL`, `formatFeeDisplay`),
   `shared/lib/currency.ts` (`formatVnd`), `shared/lib/sessionCapacity.ts` (`UNCAPPED_CAPACITY`
   sentinel, `formatParticipantCount`).
3. **`CreateSessionModal`** — a new capacity/fee row; read-side capacity/fee display on
   `SessionListCard`, `UpcomingMatches`, `SessionDetailModal`.
4. **Fixtures/MSW/e2e** — the 3 session fixtures in `e2e/mocks/fixtures.ts` needed the new required
   fields; the `POST /api/sessions` handler needed to read/store them; `matches-journey.spec.ts`
   needed a fill for the newly-required field.

Three design decisions were made explicitly with the user before implementation, then **revised
twice more via direct live feedback** during the build (see "Implementation notes" below):
- Sentinel handling: pre-existing/`GROUP_RECURRING` sessions backfilled `capacity=9999` — read-side
  displays hide the denominator at that value (`"12 participants"`, not `"12/9999 participants"`).
- (Superseded) Capacity as one plain number input — see below, replaced by "Taken slot"/"Open slot".
- (Superseded) Fee as a 3-button toggle group — see below, replaced by checkbox+input.

## Implementation notes — where the build diverged from the plan above

The approved plan's Capacity/Fee UI was **replaced twice** by direct live feedback after the first
version was built and tested (not a re-scoping — same backend contract throughout):

1. **Capacity split into "Taken slot" + "Open slot".** Originally a single "Capacity" number input
   (matching the backlog ticket's own literal wording, `"Taken slot"/"Open slot" numeric inputs`,
   which had read ambiguous at pickup — the backend only ever accepts one `capacity` total). User
   feedback clarified the intent: two inputs, sum submitted as `capacity`. "Taken slot" means the
   creator (and whoever's already with them) — it's optional, but **defaults to 1, not 0**, when
   left blank, since the creator always auto-joins the session they're creating and so always
   occupies at least one slot; "Open slot" is the required field. A live summary
   (`"{effectiveTaken}/{capacity} slots"`) renders under the two inputs so the creator sees the
   total before submitting — confirmed against the user's own worked examples: Taken blank + Open 5
   → capacity 6, shown as `"1/6 slots"`; Taken 3 + Open 4 → capacity 7, shown as `"3/7 slots"`.
   Neither taken/open is a real backend field —
   `capacity = (takenSlots === '' ? 1 : Number(takenSlots)) + Number(openSlots || 0)`, computed
   live for the summary and again at submit time.
2. **Fee changed from a 3-button toggle group to checkbox + input.** Originally `FeeTypeToggle`, a
   `role="group"` of 3 `aria-pressed` buttons (`SportSwitcher` pill idiom). Live feedback: "Free"
   and "Split cost" should be a checkbox + label each; "Fixed amount" should be a label + number
   input, not a button. Rebuilt as `FeeTypeFields`: checking Free/Split cost sets `feeType` and
   clears the amount; typing into the Fixed-amount input is what selects `FIXED` (no checkbox of
   its own) and clears itself back to empty when Free/Split cost is checked.
3. **Fixed-amount input formats a thousand-space separator while typing**, e.g. typing `50000`
   displays `"50 000"`. Since a native `type="number"` input cannot render a space-formatted value
   at all, this field became `type="text"` + `inputMode="numeric"` (`VndAmountInput`): `onChange`
   strips the raw event value down to digits only, then `value` re-renders it via
   `formatThousandSpaces`. `shared/lib/currency.ts`'s `formatVnd` (used by all 3 read-side
   components) was updated to the same space-separator convention for consistency, replacing an
   initial `toLocaleString('en-US')` comma-separated version.
4. **Every numeric field got explicit digits-only enforcement** (Duration, Taken slot, Open slot,
   Fixed amount) — a `type="number"` input still accepts `e`/`+`/`-`/`.` from the keyboard and
   doesn't validate a pasted string at all (pasting `"90 mins"` leaves the field showing that text
   until blur). `handleDigitsOnlyKeyDown` (shared by `DigitsOnlyInput` and `VndAmountInput`) blocks
   any keystroke that isn't a digit or a navigation/edit key; each field's `onPaste` rejects a
   clipboard value that isn't (after allowing space/comma/period for the Fixed-amount field only)
   purely digits.
5. **Layout**: final row is `grid-cols-10` with "Taken slot"+"Open slot" as one flex-pair block
   (`sm:col-span-5`, two inputs side by side sharing that width) and Fee taking the other
   `sm:col-span-5` — both placeholders read `"e.g. 10"` (user feedback: the two slot inputs should
   show the same hint).
6. **`SessionListCard` no longer shows a session-type/group-name row** (user decision, close-out
   tweak) — the "Standalone"/group-name line (`IconUsersGroup` + `session.groupName ?? 'Standalone'`)
   was removed from the card entirely; `SessionDetailModal`'s own "Standalone"/"Group session" badge
   is untouched (a different component, not in scope for this request). The now-visually-identical
   `GroupLinked` Storybook story was removed since it no longer demonstrates a distinct state; two
   unit tests asserting the removed text were removed; `MatchesPage.test.tsx` and
   `matches-journey.spec.ts`'s step 1 were updated to assert something the card still renders
   (location name / both session titles) instead.

## What was built

- **`shared/types/session.ts`** — `FeeType` type; `Session` gains `capacity: number`,
  `feeType: FeeType`, `feeAmountVnd: number | null`.
- **`features/session/types.ts`** — `CreateSessionPayload` gains required `capacity`/`feeType` +
  optional `feeAmountVnd`; `UpdateSessionPayload` gains all three as optional.
- **`shared/lib/currency.ts`** (new) — `formatVnd()`.
- **`shared/lib/feeType.ts`** (new) — `FEE_TYPE_LABEL`, `formatFeeDisplay()`.
- **`shared/lib/sessionCapacity.ts`** (new) — `UNCAPPED_CAPACITY = 9999`, `formatParticipantCount()`.
- **`features/session/components/CreateSessionModal.tsx`** — new row: Taken slot + Open slot (flex
  pair, `sm:col-span-5`, plus a live `"{taken}/{capacity} slots"` summary) and Fee (`FeeTypeFields`,
  `sm:col-span-5`). `DigitsOnlyInput` (digits-only `type="number"` wrapper) used for Duration/Taken
  slot/Open slot; `VndAmountInput` (formatted `type="text"`) used for the Fixed-amount field.
  `isValid` extended: Open slot required; Fixed amount required only when `feeType === 'FIXED'`.
- **`features/session/components/SessionListCard.tsx`**, **`shared/components/UpcomingMatches.tsx`**,
  **`features/session/components/SessionDetailModal.tsx`** — participant count now reads
  `"N/capacity participants"` once a real capacity was chosen (`formatParticipantCount`), plus a fee
  line/tag (`formatFeeDisplay`). Fixed the now-stale "the real backend has no capacity field"
  comments in `SessionListCard.tsx`/`UpcomingMatches.tsx`. `SessionListCard`'s session-type/
  group-name row (`IconUsersGroup` + "Standalone"/group name) was removed entirely (user decision) —
  `SessionDetailModal`'s own "Standalone"/"Group session" badge is untouched.
- **Tests**: `CreateSessionModal.test.tsx` extended (capacity/fee validation, digits-only
  keystroke/paste rejection for all 4 numeric fields, thousand-space formatting/paste-normalizing
  for Fixed amount, the live taken/capacity summary against the user's own worked examples);
  `SessionListCard`/`SessionDetailModal`/`UpcomingMatches` test + stories files extended for the new
  capacity/fee display and sentinel-hiding behavior; `SessionListCard.test.tsx`'s two
  session-type/group-name tests removed along with the row itself.
- **Fixtures/MSW**: `e2e/mocks/fixtures.ts`'s 3 session fixtures given real `capacity`/`feeType`/
  `feeAmountVnd` values (one real-capacity+fixed-fee `STANDALONE` fixture, two sentinel-default
  `GROUP_RECURRING` fixtures, matching the backend's own reasoning that recurring sessions have no
  capacity/fee input at all); `e2e/mocks/handlers/sessions.ts`'s `POST /api/sessions` handler reads
  and stores the 3 new fields; `matches-journey.spec.ts` fills the now-required Open slot field.

## Verification

- `pnpm exec tsc -b` — clean, no errors.
- `pnpm exec vitest run` — full suite, 737/737 passing (multiple times across the iteration rounds
  above).
- `pnpm exec playwright test --project=e2e matches-journey` — **inconclusive, not a pass**: failed
  at the pre-existing login step (`seedAuthenticatedSession`) with "Invalid email or password",
  which means Playwright reused an already-running dev server on port 5173 that wasn't pointed at
  the e2e mock backend (a real, separately-running dev session on this machine, not something this
  ticket's code touches) — same class of environment conflict flagged as inconclusive in
  CLIENT-SESSION-2's own verification. Not re-attempted further to avoid interfering with that
  running process.
- Storybook/browser walkthrough not performed live this session (no connected Chrome tooling) —
  Vitest/RTL component tests plus the Storybook stories added/updated for every new visual state are
  the verification evidence for this ticket, consistent with `client/CLAUDE.md`'s testing layers.

## Known consequence, not filed as a tracked ticket (user decision)

Adding capacity/fee text to `UpcomingMatches` changes what renders inside Home Feed's right rail,
which legitimately shifts the 9 committed Home Feed visual-regression baselines under
`e2e/visual/__screenshots__/home-feed-*.png` — the same class of drift HF-13 through HF-19 each
tracked as their own follow-up ticket. User decision this time: note it here rather than file a new
`HF-*` backlog ticket. Regenerating the baselines needs the same manual `update-baselines` GitHub
Actions dispatch those tickets used (see e.g. `client/docs/HF-13_REGENERATE_VISUAL_BASELINES.md`).

## Out of scope / follow-ups

- CLIENT-SESSION-4 (invite/auto-approve + approval queue), CLIENT-SESSION-5 (favorite locations),
  CLIENT-SESSION-6 (discover browse UI) remain `TODO`, unaffected by this ticket.
- No `UpdateSessionPayload` UI exists yet for editing capacity/fee post-creation — no session-edit
  screen exists at all yet (out of scope, matches CLIENT-SESSION-1's original scope boundary).
