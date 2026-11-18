# SESSION-GROUP-3 · Share a group session with other members of the group

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-GROUP-1 (group sessions can exist with members creating them); client pair: CLIENT-GROUP-SESSION-3
**Filed:** 2026-11-19, from the owner's specification ("Modal: share button trigger for invitation dialog with group member only"). Re-states the SESSION-66 rule for group sessions, which refused them (`SESSION_SHARE_NOT_ALLOWED`: "group chain comes after").

`POST /api/sessions/{id}/shares` accepts a group session, with these differences from a standalone one (owner, 2026-11-19):
- **Caller:** any member of the group (not only participants). A non-member cannot even load the session, so the gate answers first: 404 unavailable, then 403 `SESSION_FORBIDDEN` / `SESSION_GROUP_MEMBER_REQUIRED` as the detail gate does.
- **Recipients:** current active members of the group only, **not friends**. A recipient who is not a member, is deactivated or is the caller is **skipped silently** and counted in `skipped`, as SESSION-66 does. Cap 50 per call, as for standalone (`SESSION_SHARE_LIMIT_EXCEEDED`).
- **Event:** the existing `session.share.created` ("{name} shared {session} with you"). No `INVITED` row, no participant change.
- `SessionShareGate`: a group session is shareable (group active, caller a member); a **private standalone** session stays not shareable (SESSION-69). `SESSION_SHARE_NOT_ALLOWED` means "a private session" again, so its `ERROR_CODES.md` text, the Swagger text and the en/vi message change.

**Consumer census:** `SessionShareGate` and its spec, `shareSession`, `SessionController` Swagger text, `ERROR_CODES.md`, `session-impl/CLAUDE.md` rule 13, `NOTIFICATION_USE_CASES.md` NOTIF-13, the SESSION-66 and SESSION-69 tickets' wording, client `errors.json` (`SESSION_SHARE_NOT_ALLOWED`) and `canShare` (CLIENT-GROUP-SESSION-3), `GroupService` (batch member check from SESSION-GROUP-1). **Account lifecycle:** JWT filter for the caller; recipients through `getActiveUserIds`.

**Out of scope:** sharing outside the group, sharing a regular session differently from a custom one.

**Tests:** Spock for the gate and the recipient filter; IT: a member shares with members, a non-member recipient is skipped, a non-member caller is refused, a private standalone session is still refused, the notification reaches the recipient through the real consumer.

---
