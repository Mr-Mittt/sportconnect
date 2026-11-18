# CLIENT-SESSION-51 · Localised system comments for the fields a host changed (pair of SESSION-67)

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-67
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass. Per the CLIENT-NOTIF-4 rule: a new value the client branches on belongs in the same change or in a ticket filed alongside, so this is filed with SESSION-67.

SESSION-67 writes one system comment per changed field, each with a `systemCode` (`SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_START_CHANGED`, ...) and string params `old` and `new`. The client renders them in the thread in the viewer's language through `systemEntryText.ts` and the `enums.json` keys (the CLIENT-GL-51 mechanism), e.g. "Start changed from 18:00 to 19:00" / "Giờ bắt đầu đổi từ 18:00 sang 19:00". Times are instants formatted in the viewer's zone, money with the shared VND formatter, enum values (fee type, game mood) with their existing labels. An unknown code, or a missing param, shows the stored English `content` (an old row keeps its text).

**en/vi** per code; the `systemEntryText` tests extend to every code; Storybook for a thread with several field changes; the comment is drawn as a system entry (not as a user's comment, the CLIENT-SESSION-13 lesson).

**Out of scope:** The server side (SESSION-67), notification text.

**Tests:** Vitest per code (en and vi, fallback), mutation-check the fallback branches.

## Scope change, 2026-11-18 (owner, at SESSION-67 pickup): four sentence shapes

The en/vi copy has four shapes per field, picked from the `old` and `new` params (empty string = no value): **added** (old empty, new set) `Alex added the start time "19:00"`; **updated** (title, location note and fee note only, both set) `Alex updated the fee note "Bring cash"`; **changed** (every other field, both set) `Alex changed the fee from "Free" to "Split"`; **removed** (new empty) `Alex removed the duration`. The attributes comment has no values ("Alex updated the sport details"). The fee comment carries `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd`, which the client turns into one value ("Free", "50,000 VND"). The full table and rules are in SESSION-67. The tests cover every shape per code in en and vi, plus the fallback to `content`.

**Contract as built by SESSION-67 (2026-11-18).** Codes: `SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_LOCATION_NOTE_CHANGED`, `SESSION_START_CHANGED`, `SESSION_DURATION_CHANGED`, `SESSION_CAPACITY_CHANGED`, `SESSION_FEE_CHANGED`, `SESSION_FEE_NOTE_CHANGED`, `SESSION_AUTO_APPROVE_CHANGED`, `SESSION_INITIAL_SLOT_CHANGED`, `SESSION_MALE_SLOTS_CHANGED`, `SESSION_FEMALE_SLOTS_CHANGED`, `SESSION_GAME_MOOD_CHANGED`, `SESSION_ATTRIBUTES_CHANGED`. Params (strings): `name` (the editor) on every code; `old` and `new` on every code but the two below (`""` = no value). Values: location is a name, start an ISO instant (format in the viewer's zone), duration is minutes (add the unit), auto approve is `true`/`false`, slots and capacity are numbers, game mood is 1-10. `SESSION_FEE_CHANGED` has `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd` instead (amount empty unless `FIXED`; type empty when there was none). `SESSION_ATTRIBUTES_CHANGED` has `name` only. The comments of one save arrive with separate timestamps and their order in the thread is not guaranteed to match the form's. Initial slots of `0` arrive as empty ("removed"), as do cleared male and female slots.
