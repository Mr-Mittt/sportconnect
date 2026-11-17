# CLIENT-NOTIF-7 · The notification for a rejected join request shows the host's reason (pair of NTF-8)

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** NTF-8
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass.

NTF-8 adds a nullable `message` to the notification. For `session.join_request.rejected` the notification item shows it under the existing line ("Your request to join {session} was declined"), labelled "Reason: ..." (en/vi), clamped to two lines with the full text on hover and in the item's accessible name. No message, no extra line. Other types ignore the field.

**Types and mocks:** `message?: string | null` on the notification type; the MSW handler and fixtures gain a rejected notification with and without a reason; `notificationText.test.ts` is unchanged for the base text. **I18N-4:** no server prose beyond the host's own text, which is user content shown as written.

**Out of scope:** The server side (NTF-8), the group invitation reject reason.

**Tests:** Vitest for the item (with, without, long text), Storybook state; the changed surface goes into `BASELINE-UPDATE-1`.
