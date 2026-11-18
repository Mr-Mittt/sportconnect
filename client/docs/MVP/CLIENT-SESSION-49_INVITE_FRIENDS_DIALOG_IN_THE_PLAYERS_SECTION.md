# CLIENT-SESSION-49 · "Invite friends" from the Players section header

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-66
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass.

In the session modal's Players section header a **"{person}+"** button (an icon button with `aria-label`) opens an **Invite friends** dialog. Shown only to a `JOINED` caller (the host of a standalone session is one), only for a standalone session that is `PREPARING` or `SCHEDULED`; hidden once `ONGOING`, `COMPLETED` or `CANCELLED`, and for group sessions (those come after the standalone chain).

**Dialog.** All of the caller's friends, one row each: avatar and name on the left (the same friends hook and row look as `InviteFriendField` in `CreateSessionModal`; the name filter is the shared name rule from CLIENT-GL-50). **Not joined** friends (including `REQUESTED` and `INVITED`) are listed first, each with a checkbox. **Joined** friends are listed below, the text "Joined" right-aligned, no checkbox. The footer button reads **Invite (x)** with x the number of ticked friends and is disabled at 0. Sending calls `POST /api/sessions/{id}/shares`; success closes the dialog with a short confirmation, a coded error shows its en/vi text. The friend gets a notification and opens the session from it to decide on a join request; nothing here changes the Players list.

**en/vi** for every new string (title, filter placeholder, "Joined", button, confirmation, empty list "You have no friends to invite yet.", the new error codes `SESSION_SHARE_NOT_ALLOWED` and `SESSION_NOT_SHAREABLE`), the I18N-4 census row for this dialog, `EmptyHint` for the empty state, MSW handler and fixtures for the endpoint, the dialog title centered as every dialog.

**Server contract (built by SESSION-66, 2026-11-18).** `POST /api/sessions/{id}/shares` with `{ "userIds": [...] }` (1 to 50) answers `{ sent, skipped }` (`data`). `sent` can be lower than the number ticked: anyone who is no longer a friend (silently, no error), friends who joined, requested or were invited in the meantime, and friends deactivated since the list loaded are skipped, so the confirmation should say how many were notified (`sent`), not echo the ticks. A friend who left the session earlier is notified again. Errors: 403 `SESSION_SHARE_NOT_ALLOWED` (not a `JOINED` participant, or a group session), 409 `SESSION_NOT_SHAREABLE` (`errorParams.status`: the session moved on to `ONGOING`, `COMPLETED` or `CANCELLED` while the dialog was open), 404 `SESSION_NOT_FOUND`, and the generic `VALIDATION_FAILED` for an empty or over-50 list. The notification the friend gets is the existing "invited you to join" one, so the notification list needs no change.

**Out of scope:** Group sessions, inviting people who are not friends, seeing who was already notified, host approval of a share.

**Tests:** Vitest for the dialog (grouping, order, selection count, disabled at 0, filter, error), a scoped e2e (open, tick two, send, notification request body), Storybook states; the changed surface goes into `BASELINE-UPDATE-1`, no baseline is regenerated.
