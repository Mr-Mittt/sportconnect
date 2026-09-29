# CLIENT-I18N-5 · Translate client-mirrored backend enums

**Status:** `DONE` (2026-09-29)
**Type:** Enhancement (broad, incremental)
**Depends on:** CLIENT-I18N-2 (step 1), ideally after CLIENT-I18N-4 (the pages these labels render
inside should already be translated, so a Vietnamese page doesn't get an English status pill)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup — step 4 of that ticket's ordered
list. Closes `documentation/md/I18N_READINESS.md`'s **I18N-5** (`CANDIDATE`, sized into this ticket
at that doc's own 2026-09-25 update).

## What

Translate the display strings the client generates from ~15 hand-mirrored backend enum values —
session status labels, post/comment type labels, `getNotificationText`'s per-`NotificationType`
strings, and any other enum-driven copy found at pickup. Distinct from generic static UI copy
(buttons, nav labels): these are backend-enum-driven, not authored directly in a component's JSX,
so they need their own audit pass to find every call site rather than a simple grep for hardcoded
strings.

**Entry point:** wherever an enum-driven label renders — notification bell/list, post/comment type
badges, session status pills, etc.
**Inputs/outputs:** no data-shape change — the enum values themselves are untouched; only their
display-string mapping becomes locale-aware.

## Notes for pickup

- Less likely to apply here (enum labels aren't form validation), but skim
  `documentation/md/I18N_READINESS.md`'s I18N-10 anyway — if any enum-driven surface this ticket
  touches turns out to live inside a form (e.g. an admin editor with an enum-backed select), the
  same native-validation and server-error checks apply, including adding a row to I18N-4's own
  census table if it shows a server error verbatim.
- `NotificationType` is an exhaustive union, so the compiler already forces a case for every new
  member added to `getNotificationText` — this ticket adds the translated-string lookup inside each
  existing case, it doesn't change the exhaustiveness guard itself.
- Do a real audit at pickup (grep every `switch`/lookup keyed on an enum-shaped value under
  `src/features/`/`src/shared/`) rather than assuming the list is only the ones named above — this
  ticket's own filing note explicitly flags "distinct chunk of the surface, worth accounting for in
  scope/sizing... not discovered partway through" (I18N-5).
- Same per-namespace checklist as every prior i18n ticket: `.storybook/preview.ts` registration +
  `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines wherever an enum label
  is visible.

**Out of scope:** backend message/enum localization itself (I18N-4 — the *value* stays an English
enum constant on the wire; only the client's own display mapping is translated here); the language
picker UI.

## Pickup audit (2026-09-29)

Full audit found 7 enum-driven surfaces (one more than the ticket's own named examples). Cross-
checking against sibling ticket `CLIENT-I18N-6` (filed the same day) surfaced a pre-existing,
deliberate split for two of them — see the correction below the list.

1. `NotificationType` → `getNotificationText` (`src/features/notifications/notificationText.ts`)
2. `SessionStatus` (+ `autoApprove` bool) → `sessionStatus.ts`, `SessionCard.tsx`,
   `DiscoverStatusFilter.tsx`, `SessionDetailModal.tsx` ("Auto approval"/"Need host approval",
   "Waiting for host approval.")
3. ~~`FeeType`~~ — **out of scope, see correction below.**
4. ~~`ParticipationActionKind`~~ — **out of scope, see correction below.**
5. `SportAttributeType` (BOOLEAN Yes/No, `DEFINITION_LIST` "Item N") →
   `attributeFields/attributeValues.tsx`
6. **`FriendshipStatus`** (NONE/PENDING_SENT/PENDING_RECEIVED/FRIENDS) → `FriendProfilePanel.tsx`
   — **not named in the original ticket scope; added at pickup (user decision, 2026-09-29)** per
   this ticket's own "do a real audit, don't assume the named list is complete" instruction.
7. `JoinFeedbackKind` (`JoinFeedbackDialog.tsx`) — **already translated** (`sharedDialogs`
   namespace, prior ticket) — excluded, confirmed not a gap.
`PostType` was checked and found to derive no display label at all (only gates a `disabled` prop) —
confirmed not in scope, nothing to translate there.

**Correction (user decision, 2026-09-29):** `FeeType` (`feeType.ts`) and `ParticipationActionKind`
(`sessionParticipation.ts`) were initially audited in as enum-driven, but `CLIENT-I18N-6`'s own
filed text already deliberately claims them as its "Sessions/Matches slice" — "client-authored UI
copy," explicitly contrasted there against `sessionStatus.ts` which it names as CLIENT-I18N-5's job.
Deferred to that existing split rather than re-litigated: **this ticket's final scope is
`NotificationType`, `SessionStatus` (+ `autoApprove`), `SportAttributeType`, `FriendshipStatus`** —
`feeType.ts`/`sessionParticipation.ts` stay with `CLIENT-I18N-6`.

**Namespace decision (user, 2026-09-29):** one new `enums` namespace
(`src/locales/{en,vi}/enums.json`) holding `sessionStatus` / `notifications` / `friendship` /
`attributeValues` sub-keys, rather than splitting per feature domain — this ticket is one cohesive
audit pass, not per-domain work.

**Adjacent I18N-10 gap found, folded into `CLIENT-I18N-6` instead of a new ticket (user decision,
2026-09-29):** `CreateSessionModal` (same file family as `FeeTypeFields.tsx`, which is now back in
`CLIENT-I18N-6`'s scope per the correction above) has pre-existing raw-literal custom validation
strings ("Sport is required.", "Title is required.", etc.) — an I18N-10-class gap. Noted directly on
`CLIENT-I18N-6`'s own ticket file rather than filed separately, since that ticket already claims the
whole file.

## Implementation summary

Built exactly the locked scope above — `NotificationType`, `SessionStatus` (+ `autoApprove`),
`SportAttributeType` (`BOOLEAN`/`DEFINITION_LIST`), `FriendshipStatus`. No divergence from the
approved plan.

**Namespace:** one new `enums` namespace (`src/locales/{en,vi}/enums.json`), 5 sub-objects:
`sessionStatus` (`SCHEDULED`/`ONGOING`/`PREPARING`/`COMPLETED`/`CANCELLED` — keyed directly by the
enum value, so consumers do `t(\`enums:sessionStatus.${status}\`)` with no intermediate mapping
table), `sessionApproval` (`auto`/`hostApproval`, the `session.autoApprove` boolean fragment),
`attributeValues` (`yes`/`no`/`item`/`itemWithValue`), `friendship` (`sendRequest`/
`waitingForResponse`/`cancelRequest`/`decline`/`accept`), `notifications` (17 keys — one per
`NotificationType` case, the "Someone"/"your session" fallbacks, the fallback sentence, and the
"and N others" pair). Registered in `app/i18n.ts`, `app/i18n.test.ts` (key-parity), and
`.storybook/preview.ts`, same 3-file checklist every prior i18n ticket follows.

**Non-component i18n:** `notificationText.ts`'s `getNotificationText`, `sessionStatus.ts`'s new
`getSessionStatusLabel(status)`, and `attributeValues.tsx`'s `BOOLEAN` renderer + `accordionSummary`
are all plain functions, not components — same as `CLIENT-I18N-4`'s `relativeTime.ts` precedent,
they read the i18next singleton directly (`i18next.t()`) rather than via `useTranslation()`. The
three real-component call sites this pulled in (`SessionCard.tsx`, `DiscoverStatusFilter.tsx`,
`SessionDetailModal.tsx`) had no i18n of their own before this ticket; rather than retrofit a
`useTranslation()` subscription into each just to consume a shared label function, they call
`getSessionStatusLabel`/`i18next.t()` directly too — consistent with how this codebase already
ships `relativeTime` inside the equally-unsubscribed `NotificationRow`, and low-risk since no
language-picker UI exists yet (the only two ways `locale` changes today are the tier-1
`setUserLanguage` on login/preference-load and Storybook's toolbar, both of which cause a real
re-render anyway). `FriendProfilePanel.tsx` follows the same direct-`i18next.t()` pattern for
consistency across the ticket, even though it's a genuine component.

**Scope corrections made at pickup (both already noted in the "Pickup audit" section above, restated
here for the record):**
- `FeeType`/`ParticipationActionKind` were initially audited in, then deferred back to
  `CLIENT-I18N-6` once its own filed text turned out to already claim them as "client-authored UI
  copy" — a real cross-ticket conflict caught before any code was written, not just a hypothetical.
- `FriendshipStatus` was added to scope (not in the ticket's original named list) after the
  mandated real audit found it — same shape gap the ticket's own filing note warned about.
- The `CreateSessionModal` I18N-10 validation-copy gap found while auditing `FeeTypeFields.tsx` was
  folded into `CLIENT-I18N-6`'s ticket file as a note rather than filed as a new ticket, since that
  ticket already claims the whole file.

## Verification

- **tsc/eslint:** clean across every touched file (`app/i18n.ts`, `app/i18n.test.ts`,
  `.storybook/preview.ts`, `notificationText.ts`, `sessionStatus.ts`, `SessionCard.tsx`,
  `DiscoverStatusFilter.tsx`, `SessionDetailModal.tsx`, `attributeValues.tsx`,
  `FriendProfilePanel.tsx`, both new `enums.json` files).
- **Vitest:** 9 files / 151 tests green, scoped to every file in the diff plus their existing test
  suites (`i18n.test.ts`, `notificationText.test.ts`, `NotificationRow.test.tsx`,
  `NotificationBell.test.tsx`, `SessionCard.test.tsx`, `DiscoverStatusFilter.test.tsx`,
  `SessionDetailModal.test.tsx`, `SessionAttributesSummary.test.tsx`,
  `FriendProfilePanel.test.tsx`) — all pass unchanged, since the English translation values are
  byte-identical to the strings they replaced.
- **E2E:** scoped subset (not the full `e2e` project, per this session's token-budget convention) —
  `notification-bell.spec.ts`, `matches-journey.spec.ts`, `friends-journey.spec.ts`,
  `locale.spec.ts` — **12/12 passed**.
- **Visual-regression expectation:** no baselined surface's *content* legitimately changes — every
  string still renders identically in English (the default/baseline locale), so no baseline update
  is expected. Confirmed via stash-and-rerun on the two most relevant specs:
  `app-session-detail-modal.spec.ts` (33 test cases across 3 breakpoints) and
  `app-notification-bell.spec.ts` — byte-identical 33/33 failure set on branch vs. clean `master`,
  the documented Windows font-rendering noise floor, not a regression.
- **Live browser / Storybook walk:** not done — the Claude in Chrome extension wasn't connected in
  this environment (same blocker `CLIENT-I18N-4` hit: "Browser extension is not connected"). A
  local Storybook instance was also attempted as a fallback but hit port contention from an earlier
  failed background-process attempt in this same session; cleaned up (process killed, port 6006
  confirmed free) rather than left running. The scoped Vitest + Playwright e2e evidence above — both
  render the real components with the real translated strings — stands in its place.

## Follow-up

No new tickets filed by this ticket itself — the one adjacent gap found (`CreateSessionModal`'s
I18N-10 validation copy) was folded into the already-existing `CLIENT-I18N-6` rather than filed
separately (see the correction note above).
