# CLIENT-SESSION-51 · Localised system comments for the fields a host changed (pair of SESSION-67)

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-67
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass. Per the CLIENT-NOTIF-4 rule: a new value the client branches on belongs in the same change or in a ticket filed alongside, so this is filed with SESSION-67.

SESSION-67 writes one system comment per changed field, each with a `systemCode` (`SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, `SESSION_START_CHANGED`, ...) and string params `old` and `new`. The client renders them in the thread in the viewer's language through `systemEntryText.ts` and the `enums.json` keys (the CLIENT-GL-51 mechanism), e.g. "Start changed from 18:00 to 19:00" / "Giờ bắt đầu đổi từ 18:00 sang 19:00". Times are instants formatted in the viewer's zone, money with the shared VND formatter, enum values (fee type, game mood) with their existing labels. An unknown code, or a missing param, shows the stored English `content` (an old row keeps its text).

**en/vi** per code; the `systemEntryText` tests extend to every code; Storybook for a thread with several field changes; the comment is drawn as a system entry (not as a user's comment, the CLIENT-SESSION-13 lesson).

**Out of scope:** The server side (SESSION-67), notification text.

**Tests:** Vitest per code (en and vi, fallback), mutation-check the fallback branches.
