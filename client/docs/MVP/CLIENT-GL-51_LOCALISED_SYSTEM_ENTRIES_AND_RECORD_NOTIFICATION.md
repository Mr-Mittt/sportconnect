# CLIENT-GL-51 · Localised system comments and posts, and the record-changed notification

**Status:** `DONE` (2026-11-17)
**Type:** Feature · **Depends on:** SESSION-GL-63 (the server side; this ticket can only be built against its contract) ·
**Filed:** 2026-11-17, `/workon session` SESSION-GL-63: the owner turned every system comment into a client-localised one and asked for the client side to be filed with it (CLIENT-NOTIF-4 rule: a new notification type and new codes the client branches on).

SESSION-GL-63 gives a server-written entry a stable `systemCode` and `systemParams` next to its `content` (a plain-English fallback). This ticket makes the client use them:

- **System comments** (a `SESSION_SYSTEM` comment, drawn by `CommentItem` through `SystemNoticeLine`) and the **`GROUP_SYSTEM` welcome post** (drawn by the post card) show the en/vi copy for their code, with the params filled in (the actor's or member's name; the welcome post has two variants, with and without the inviter). An entry without a code (every row written before SESSION-GL-63, which is not backfilled) keeps showing its stored `content`. Codes: `SESSION_JOINED`, `SESSION_LEFT`, `SESSION_STARTED`, `SESSION_RECORDS_UPDATED` ("{name} has updated the result"), and the group welcome codes (final names come with the server ticket).
- **The notification** SESSION-GL-63 sends to a session's participants when a result changes: a new `NotificationType` member (routing key fixed by the server ticket, expected `session.record.changed`) with its text in `getNotificationText`, en and vi, and the route it opens (the session). The type union is exhaustive, so the build fails until the case exists.
- Mirrored types: `Comment` and `Post` gain the optional `systemCode` and `systemParams`; the unknown-code case (a newer server) falls back to `content`.

**Out of scope:** backfilling old entries (owner: stay English); the server side; tagging notifications (NOTIF-12).

**Tests:** Vitest for each code in en and vi, the fallback (no code, unknown code) and the notification text; the I18N-4 census row is not touched (no server error is shown); a scoped e2e that opens a session thread and a group feed with a coded entry. Visual baselines: derive at pickup (the session thread and the group feed render these entries).

---

## Scope change (2026-11-17, owner, at pickup): session and thread UI enhancements

Added to this ticket (the title now covers more than system entries):

1. **Older comment and reply timestamps:** a comment or reply older than 7 days shows its full date instead of "N days ago"; hovering shows the full date and time (the system-entry line already has the hover).
2. **Countdown in the session modal header** for a `SCHEDULED` session: "Starts in {{days}} days, hh:mm:ss", the days part dropped when it is 0 (en and vi).
3. **Confirmations:** leaving a session asks "Are you leaving?" / "Oh, this session will start in {{time}}. Do you still want to leave?" with "Stay" and "Leave"; cancelling a join request asks "Cancel your request?" / "Your request is still waiting for approval. Do you want to wait a bit?" with "Keep waiting" and "Cancel".
4. **New leave rule (server: SESSION-65, filed):** a joined participant can leave only until 15 minutes before the start. The modal shows a hint to the left of the Leave button ("You can leave only until 15 minutes before the start") and hides the button after the cutoff. Client copy for the server's `SESSION_LEAVE_TOO_LATE` error in `errors:codes`.
5. **Rename:** the "Session information" section title becomes "Information" (en and vi).

Out of scope stays as above.

**Added later the same day (owner):** the older-than-7-days timestamp rule (item 1) also applies to **post** timestamps: the post card, the post header in the comment modal and a group broadcast show the full date once the post is more than 7 days old, with the date and time on hover. Notification rows stay relative (they are not posts).

**Also (owner):** the full date leaves out the year when it is the current year ("Nov 3"), and keeps it for an earlier year ("Nov 3, 2025").

**Also (owner, mid-implementation):** the session modal's fee section lays out in two columns: all the fee options on the left, the fee note on the right (stacked on a narrow screen).

**Also (owner, mid-implementation):**
- The countdown sits on the same line as the status and the start and end times in the modal header ("SCHEDULED · Sat, Aug 1 · 19:00 – 21:00 · Starts in 2 days, 03:04:05"), not on a line of its own.
- "Are you leaving?" and "Cancel your request?" also apply to the **session card's** action button (every card: rails, discover, matches, history), not only the modal. This absorbs the follow-up filed an hour earlier as CLIENT-GL-52, which is removed.


---

## Implementation summary (2026-11-17)

**Design as approved** ("approved, go implement"), plus the owner's additions made during the build (listed under "Scope change" above), built as designed.

1. **System entries by code.** `Comment` and `Post` gain optional `systemCode` and `systemParams`. `systemEntryText(code, params, fallback)` (`shared/lib`) reads `enums:systemEntries.<CODE>` (six codes, en and vi) and returns the stored `content` when there is no code, the code is unknown, or a param the sentence needs is missing. `CommentItem` uses it for a `SESSION_SYSTEM` comment and `PostCard` for a post (the group welcome post, both variants).
2. **Notification.** `NotificationType` gains `session.record.changed`; `getNotificationText` shows "{actor} updated the result of {session}" (en and vi). The bell already opens the session for `entityType === 'SESSION'`, so no routing change.
3. **Timestamps.** `formatTimestamp` (`shared/lib/timestamp.ts`): relative while at most 7 days (7 x 24 h exactly) old, then the date without the year in the current year (`Nov 3`, `3 thg 11`) and with it for an earlier year (`Nov 3, 2025`). Used by `CommentItem` (comments, replies, the system line), `PostCard`, the post header in `CommentSection` and `GroupBroadcasts`; each carries the full date and time as its hover. `formatRelativeTime` is unchanged for the notification rows. New `session:dateFormat.monthDay`.
4. **Countdown.** `useNow` (1 s tick) and `formatCountdownSpan`; the session modal header shows "Starts in 2 days, 03:04:05" on the status line, after the start and end times, for a `SCHEDULED` session (days dropped at 0, "Starting..." at zero). The clock only runs while the start is ahead.
5. **Questions.** `ConfirmLeaveDialog` ("Are you leaving?", with the time left, "Stay" primary) and `ConfirmCancelRequestDialog` ("Cancel your request?", "Keep waiting" primary), in the detail modal **and** in `SessionCard` (so every rail, discover list, matches list and history row), rendered as siblings of the card so their clicks never open its details. Accepting an invitation and declining one have no question.
6. **Leave rule (server: SESSION-65, filed).** `LEAVE_CUTOFF_MINUTES = 15`, `canLeaveBeforeStart`, applied inside `getParticipationAction` (so the modal and every card), with `now` as a parameter; the modal ticks so the button and its hint ("You can leave only until 15 minutes before the start.") disappear by themselves. `errors:codes.SESSION_LEAVE_TOO_LATE` in en and vi; the I18N-4 census row of the session leave action names it.
7. **Fee section.** `CostFields` (create form and detail editor): two columns, every fee option on the left and the note on the right, from a 384 px container up (a container query, since the dialog is narrower than the screen); stacked below.
8. **Rename.** "Session information" is now "Information" / "Thông tin" (read-only section title).

**Deviations from the approved plan:** (a) the card confirmation was first filed as follow-up CLIENT-GL-52 and then folded in at the owner's request (the follow-up file and row are removed); (b) the countdown moved from its own line to the status line; (c) the timestamp rule grew to posts and to the year rule; (d) the fee layout was added. The leave cutoff also hides Leave on cards (the plan said the modal), because the same function feeds both.

**Tests.** Vitest (all new unless noted): `systemEntryText` (six codes in en and vi, no code, unknown code, missing param, no HTML escaping), `countdown` / leave cutoff (formatting, plural, days dropped, zero, 15-minute boundary to the second, other participation kinds unaffected), `timestamp` (7-day boundary, current and earlier year, vi), `CommentItem` / `PostCard` (coded entries, fallbacks, date and hover), `notificationText`, `SessionDetailModal` (countdown shown and ticking, only for SCHEDULED; both questions; Escape stays; hint; cutoff at 14 and 16 minutes; disappears while open; ongoing; late invitee can still decline; the rename), `SessionCard` (both questions, Accept direct, no Leave inside 15 minutes, the questions never open details), `CostFields` (columns), the i18n parity test. Stories: modal (joined with countdown, too late to leave), both dialogs. Mutation check: 23 mutants of the new logic (cutoff boundary and size, cutoff ignored, countdown days and zero, missing param, ignored code on a comment and on a post, the 7-day and year rules, post hover, leave and cancel skipping the question, Stay confirming, modal not ticking, countdown for every status, hint on cancel, wrong notification text), all 23 killed.

**E2E.** `e2e` project: `matches-journey` (pins the browser clock a week before the fixtures; countdown, hint, question and Stay, Leave disappearing 10 minutes before the start, the card's questions, the Cancel question with Keep waiting then Cancel, the two fee columns by bounding box), `session-errors` (clock pinned, the card's Leave confirmed), plus the post, feed, notification, results, thread-tag, locale and a11y specs: all passed. During the work a few runs showed `Target page ... has been closed` crashes and, twice, a11y, `locale` and `post-tags` timeouts under load; each passed on an isolated re-run, so they were machine-load flakes and not regressions (the session-errors card test and matches steps 5 and 5b were real regressions from the new Leave rule and were fixed in the specs).

**Visual-regression expectation:** baselines `session-detail-{not-joined, already-joined, invited, requested, approval-queue, discussion}-*` at 375, 768 and 1280 change (the countdown on the status line, "Information", the leave hint), `session-detail-cancelled-*` changes through the title only; `session-detail-preparing-*`, the fee section and every other baseline are not expected to change (no visual spec opens the Cost section). Recorded in `BASELINE-UPDATE-1`; every other baseline must come back byte-identical. Visual regression was not run here.

**Not run:** a real browser pass in Firefox and Safari, the real backend (the new codes and `session.record.changed` are proven against the MSW mock and the SESSION-GL-63 contract only), and visual regression.
