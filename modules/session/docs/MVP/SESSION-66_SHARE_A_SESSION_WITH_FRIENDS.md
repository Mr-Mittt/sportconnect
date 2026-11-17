# SESSION-66 · A joined participant shares the session with friends (notification, no invitation row)

**Status:** `TODO`
**Type:** New Feature
**Depends on:** none (client side: CLIENT-SESSION-49)
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass.

Today friends can be invited only at creation (`CreateSessionRequest.inviteeIds`, creator only, written as `INVITED` rows). New: `POST /api/sessions/{sessionId}/shares` with `{ "userIds": [...] }` (at most 50). It is a **share, not an invitation** (owner, 2026-11-17): no participant row is written; each recipient gets a notification, opens the session from it and decides for themself to send a join request (the normal join rules apply, including host approval unless the session is auto-approve).

**Rules.** The caller is a `JOINED` participant of a standalone session (the host of a standalone session is one); the session is `PREPARING` or `SCHEDULED` (refused once `ONGOING`, `COMPLETED` or `CANCELLED`); every recipient is a **friend of the caller** (checked through `UserFriendService` in `user-api`, already a dependency of `session-impl`; a non-friend is a coded refusal, not a silent skip, so the notification cannot be used to reach strangers); a recipient who is already `JOINED`, `REQUESTED` or `INVITED` is skipped without error. Group sessions are not covered here (group and group sessions come after the standalone chain). The response is `{ sent, skipped }`.

**Notification.** One `session.invitation.created` outbox event per recipient (actor = caller, recipient = friend), so the client's notification text and click-to-open-session already work, and the unread aggregation key `(recipient, type, session)` already collapses repeats. Open at pickup: whether the text "{actor} invited you to {session}" still reads right when no invitation row exists, or whether a `session.shared` type is cleaner (it would then need its client case in the same change, CLIENT-NOTIF-4 rule). The use case is logged as NOTIF-13 in `documentation/md/NOTIFICATION_USE_CASES.md`.

**Account lifecycle.** A deactivated caller is refused by the per-request gate (`JwtAuthenticationFilter`, A25); the service still resolves access through the session gate (available, then visible to this caller) rather than assuming it. Coded errors (C12) with en/vi copy in `errors:codes` ship with CLIENT-SESSION-49, or the client ticket is filed in the same change.

**Out of scope:** Group sessions, a participant row, any host approval of the share itself, rate limiting beyond the 50-per-request cap (file separately if abuse shows up).

**Tests:** Spock for the rules and counts; an IT in `server/src/test/java/com/sportconnect/integration/` through the real pipeline: joined caller allowed, non-joined caller refused, `REQUESTED` or `INVITED` caller refused, non-friend refused, wrong status refused, group session refused, skipped recipients counted, and the outbox events written in the same transaction.
