# CLIENT-SESSION-51 · Localised system comments for the fields a host changed (pair of SESSION-67)

**Status:** `DONE` (2026-11-18)
**Type:** New Feature · **Depends on:** SESSION-67
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass. Per the CLIENT-NOTIF-4 rule: a new value the client branches on belongs in the same change or in a ticket filed alongside, so this is filed with SESSION-67.

SESSION-67 writes one system comment per changed field, each with a `systemCode` (`SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_START_CHANGED`, ...) and string params `old` and `new`. The client renders them in the thread in the viewer's language through `systemEntryText.ts` and the `enums.json` keys (the CLIENT-GL-51 mechanism), e.g. "Start changed from 18:00 to 19:00" / "Giờ bắt đầu đổi từ 18:00 sang 19:00". Times are instants formatted in the viewer's zone, money with the shared VND formatter, enum values (fee type, game mood) with their existing labels. An unknown code, or a missing param, shows the stored English `content` (an old row keeps its text).

**en/vi** per code; the `systemEntryText` tests extend to every code; Storybook for a thread with several field changes; the comment is drawn as a system entry (not as a user's comment, the CLIENT-SESSION-13 lesson).

**Out of scope:** The server side (SESSION-67), notification text.

**Tests:** Vitest per code (en and vi, fallback), mutation-check the fallback branches.

## Scope change, 2026-11-18 (owner, at SESSION-67 pickup): four sentence shapes

The en/vi copy has four shapes per field, picked from the `old` and `new` params (empty string = no value): **added** (old empty, new set) `Alex added the start time "19:00"`; **updated** (title, location note and fee note only, both set) `Alex updated the fee note "Bring cash"`; **changed** (every other field, both set) `Alex changed the fee from "Free" to "Split"`; **removed** (new empty) `Alex removed the duration`. The attributes comment has no values ("Alex updated the sport details"). The fee comment carries `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd`, which the client turns into one value ("Free", "50,000 VND"). The full table and rules are in SESSION-67. The tests cover every shape per code in en and vi, plus the fallback to `content`.

**Contract as built by SESSION-67 (2026-11-18).** Codes: `SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_LOCATION_NOTE_CHANGED`, `SESSION_START_CHANGED`, `SESSION_DURATION_CHANGED`, `SESSION_CAPACITY_CHANGED`, `SESSION_FEE_CHANGED`, `SESSION_FEE_NOTE_CHANGED`, `SESSION_AUTO_APPROVE_CHANGED`, `SESSION_INITIAL_SLOT_CHANGED`, `SESSION_MALE_SLOTS_CHANGED`, `SESSION_FEMALE_SLOTS_CHANGED`, `SESSION_GAME_MOOD_CHANGED`, `SESSION_ATTRIBUTES_CHANGED`. Params (strings): `name` (the editor) on every code; `old` and `new` on every code but the two below (`""` = no value). Values: location is a name, start an ISO instant (format in the viewer's zone), duration is minutes (add the unit), auto approve is `true`/`false`, slots and capacity are numbers, game mood is 1-10. `SESSION_FEE_CHANGED` has `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd` instead (amount empty unless `FIXED`; type empty when there was none). `SESSION_ATTRIBUTES_CHANGED` has `name` only. The comments of one save arrive with separate timestamps and their order in the thread is not guaranteed to match the form's. Initial slots of `0` arrive as empty ("removed"), as do cleared male and female slots.

---

## Implementation summary (2026-11-18)

**Design as approved** ("go ahead", 2026-11-18); built as designed, no divergence.

**Built.**
- **`src/shared/lib/fieldChangeEntry.ts` (new):** the 13 field codes (`FIELD_CHANGE_CODES`, `isFieldChangeCode`) and `fieldChangeEntryText(code, params)`. One sentence per **shape**, chosen from the `old` and `new` params (empty string = no value): **added** (old empty), **removed** (new empty), **updated** (a free-text field with both set: title, location note, fee note; shows the new text only), **changed** (every other field: `from "x" to "y"`). A field label per code, so there are 4 templates and 13 labels per language, not 52 sentences.
- **Values** are shown in the viewer's language and zone: the start (ISO instant) as `Fri, Nov 20 · 18:00` / `Thứ 6, 20 thg 11 · 18:00` (the existing `weekdayMonthDayTime` pattern), the duration as `90 min` / `90 phút`, the fee through `formatFeeDisplay` (`Free`, `Split cost`, `50 000 ₫`; type and amount on each side are one value), the mood through `formatGameMood` (`8 · Competitive`), auto approve as the existing approval labels, capacity, slots, location and text as sent. Nothing is HTML-escaped.
- **Fallback to the stored English `content`** (an old row keeps its text): the editor's name missing or empty, a param absent, both sides empty, a start that is not an instant, a duration or mood that is not a number, an approval that is not `true`/`false`, an unknown fee type, a `FIXED` fee without a numeric amount.
- **`systemEntryText`** routes the 13 field codes through it first (an empty param is a value there, not a hole); everything else is unchanged. `SESSION_ATTRIBUTES_CHANGED` carries only `name`, so it is an ordinary template ("{{name}} updated the sport details").
- **Copy** (`enums` namespace, en and vi): `systemEntries.fieldChange.{added,updated,changed,removed}`, `systemEntries.fieldLabel.<CODE>` (13), `systemEntries.SESSION_ATTRIBUTES_CHANGED`. Reused: `session:detail.summary.minutes`, `enums:sessionApproval.*`, the fee type and mood labels. No new component, hook, prop or endpoint: `CommentItem` already draws a `SESSION_SYSTEM` comment as a `SystemNoticeLine` with no like, reply or options control (CLIENT-SESSION-13), and `PostCard` shares `systemEntryText` unchanged.

**Consumer census.** `systemEntryText` (callers `CommentItem`, `PostCard`): signature unchanged, **compatible as-is**. `Comment.systemCode` / `systemParams` types (plain `string` and `Record<string, string>`): **compatible as-is**. The default MSW thread fixture keeps only `SESSION_JOINED`: **not changed** (a field-change comment there would move the session-detail modal baselines). I18N-4 census: no row (no server error is shown).

**Tests.**
- **Vitest:** `fieldChangeEntry.test.ts` (new, 62: each free-text field in added / updated / removed, each other field in its shapes, the start, duration, mood, approval and fee values in en and vi, the attributes sentence, values shown unescaped, every fallback branch for each code, the code list) and 2 new `CommentItem.test.tsx` cases (a field change is drawn as a system line with its sentence and no button; a missing value shows the stored text). `systemEntryText.test.ts` unchanged and green.
- **Storybook:** `CommentSection` story `WithFieldChanges` (a thread with start, fee, fee note, location, duration, removed slots, attributes and one unreadable value that shows the stored text). **Not opened** in a browser.
- **Mutation check:** 23 mutants of `fieldChangeEntry.ts` and `systemEntryText.ts` (shape picker in three ways, the both-empty guard, empty name, absent param, each value formatter and its guard, the fee branches, value and label wiring, text-field kinds, a dropped code, the fallback, the routing), **all 23 killed**.

**Verification.** `tsc -b` and ESLint on the touched files clean; Vitest `src/shared`, `src/app`, `src/features/session`, `src/features/feed`: 225 files, 2292 tests passed. Prettier reports the same files as unformatted before and after my change (Windows line endings), so it is not a finding of this ticket. **Not done:** Storybook not opened; no manual browser walk-through (no seeded thread carries a field change, and the default fixture is deliberately unchanged); the real server was not called (the thread JSON with these codes and params is proven by SESSION-67's integration test).

**E2E.** `e2e` project, scoped to the specs that open the session thread or the app shell (`session-thread-tags`, `session-results`, `matches-journey`, `locale`, `a11y`, `smoke`): 34 passed, 1 failed on the first run. The failure, `locale.spec.ts:187` (LocationPicker in Vietnamese), is on a surface this ticket does not touch; it passed in isolation and again in a full re-run of `locale.spec.ts` (8 of 8), so it was a parallel-load flake. I did not diagnose its cause. No spec was added or changed, so `E2E_OVERVIEW.md` is unchanged. The full `e2e` suite was not run (scoped, per the standing rule).

**Visual-regression expectation.** No baselined surface touched, no baseline change expected: the locales only gain keys, no visual spec renders a field-change comment (the session-detail modal spec shows a `SESSION_JOINED` entry, whose text is unchanged), and the stories are not part of any baseline. Recorded as a row in `BASELINE-UPDATE-1`. Visual regression was not run here.

**Release notes.** `documentation/release-notes/CLIENT.md` Unreleased: the Changes line and Depends on SERVER SESSION-67 (either order: until the client ships, the entries show the server's English text). `PROGRESS.md` updated.
