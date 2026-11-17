# NTF-8 · A notification can carry a short message; the join-request rejection puts the host's reason in it

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** none (client side: CLIENT-NOTIF-7)
**Filed:** 2026-11-17, owner decision (the standalone-session list: finish the standalone session first, then group and group sessions), checked against the existing backlogs and filed in the same planning pass. Found while checking the list: the reason is already stored (SESSION-6, `session_participants.reject_reason`) and travels in `SessionJoinRequestRejectedEvent.reason`, but `SessionEventsConsumer` drops it and the `notifications` table has no free-text column (only type, entity, actors, count).

When a host rejects a join request with a message, the rejected person's notification should show it. Add a nullable `message` column (at most 500 characters, a Liquibase migration plus the `schema.sql` mirror), expose it on `NotificationResponse`, and have the consumer copy `SessionJoinRequestRejectedEvent.reason` into it (`ParsedSessionEvent` carries an optional message). A blank reason stays `null`. The aggregation key is unchanged: a rejection is one actor to one recipient, so there is nothing to merge.

**Consumer census (API Change Discipline).** `NotificationResponse` gains a nullable field (additive: compatible as-is for every reader that ignores unknown fields); the client type, the MSW handlers and fixtures are updated by CLIENT-NOTIF-7; no other module reads the table. The STOMP ping payload is deliberately lightweight (NTF-3) and does not carry the message.

**Privacy.** The message is host-written free text shown only to its recipient; it is never logged and is cleared with the notification. No new Redis key or port.

**Out of scope:** Any other notification type carrying a message, the group invitation reject reason (a separate flow, GRP-8), changing what the reject endpoint accepts.

**Tests:** Spock for the consumer mapping (reason present, blank, null, 500 characters); the `SessionEventsConsumerIntegrationTest` family gains the case (mind the known flake, NTF-7); an IT that the read endpoint returns the message.
