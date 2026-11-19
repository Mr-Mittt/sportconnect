# SESSION-GROUP-3 · Share a group session with other members of the group

**Status:** `DONE` (2026-11-19)
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

## Implementation summary (2026-11-19)

**Built as filed.**
- `SessionShareGate.isVisibleTo`: a viewer must be identified; a **group** session is visible to a member of the group (`isGroupMember`, any status, `isPublic` irrelevant); a standalone session needs `isPublic` (a private one is still refused, SESSION-69). `isAvailable` is unchanged (404 for a missing session or an inactive group, before any member check).
- `shareSession`: the gate's forbidden code is chosen by the session's type, because a gate has one code: `SESSION_GROUP_MEMBER_REQUIRED` ("Only group members can share this session") for a group session, `SESSION_SHARE_NOT_ALLOWED` ("A private session cannot be shared") otherwise. So a non-member gets the same code as on join, and `SESSION_SHARE_NOT_ALLOWED` now means only a private standalone session. The recipients are the group's other members (one `getMemberUserIds` call, the caller removed) for a group session, and the caller's friends (one `getAcceptedFriendIds` query) for a standalone one; the rest is shared: anyone outside that set, a repeated id, a member already `JOINED`/`REQUESTED`/`INVITED` and a deactivated account are skipped and counted, at most 50 per call (`@Size`, unchanged), the same `session.share.created` event, no participant row, no system comment.
- No client change needed for the server to work; the client side is CLIENT-GROUP-SESSION-3 (`canShare` for a group session, the members list in the dialog, the en/vi text).

**Consumer census.** `SessionShareGate` (one caller, `SessionServiceImpl.shareSession`, plus its spec, both updated); `SessionServiceImpl.shareSession` and `ShareSessionRequest` (unchanged shape); `ERROR_CODES.md` (`SESSION_SHARE_NOT_ALLOWED` and `SESSION_GROUP_MEMBER_REQUIRED` rows), `session-impl/CLAUDE.md` (endpoint line and rule 13), `NOTIFICATION_USE_CASES.md` NOTIF-13 ("Group sessions are a later ticket" removed), `SessionShareIntegrationTest` (its "a group session is refused" case replaced by six group cases), `SessionPrivateSessionIntegrationTest` (still green: a private session is still not shareable). Client: `errors.json` keeps `SESSION_SHARE_NOT_ALLOWED` (the text widens back to "a private session" in CLIENT-GROUP-SESSION-3) and gains nothing here, because `SESSION_GROUP_MEMBER_REQUIRED` already has copy; `canShare` stays false for a group session until that ticket (so the server change is reachable only by an API caller for now).

**Tests.** `SessionShareGateSpec` (group member, non-member, unauthenticated, `isPublic` irrelevant, 404 before the member check) and `SessionServiceImplSpec` (4 new: group recipients are the members and not the friends, the caller / a deactivated member / a member already in are skipped, a non-member refused before any read or write, a standalone share never asks the group for members and hands the gate the private-session code); the whole session-impl suite 475 green. `SessionShareIntegrationTest` 18 (6 new: a member shares with members only and not with a friend outside the group, any status, a non-member 403 `SESSION_GROUP_MEMBER_REQUIRED`, a deactivated and an already-in member skipped, an inactive group 404, the 50 limit). Mutation check: 7 of 7 killed against a passing baseline (326 tests). **Not run:** the full `:server:test`, a live server.
