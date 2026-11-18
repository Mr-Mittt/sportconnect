# SESSION-GROUP-6 · Count and cancel the scheduled regular sessions when the rules change

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-5 (needs `recurrence_id` on sessions); client pair: CLIENT-GROUP-SESSION-6
**Filed:** 2026-11-19, from the owner's specification ("On runtime ... show session cancel confirmation, 'X session are available, Do you want to cancel those?' 'Leave it there/Cancel'").

Turning generation **OFF**, **deleting** a configuration and **switching the recurrence mode** can leave regular sessions that were generated under the old rule. The owner/admin chooses what to do with them:
- **Count endpoint** (owner/admin, `GET .../regular-sessions/count?scope=ALL|RECURRENCE&recurrenceId=`): the number of regular sessions (`recurrence_id` set) in `SCHEDULED` or `PREPARING` that would be affected: for OFF and a mode switch, all of the group's (and for the mode switch, those of the mode being left); for a delete, those of that configuration. `ONGOING` sessions are never counted or cancelled.
- **The three mutating calls** (`PUT .../settings` for OFF and mode, `DELETE .../recurrences/{id}`) take `cancelScheduled` (default `false` = "Leave it there"). When `true` they cancel the counted sessions in the same request through the existing cancel path with a system reason, which emits `session.group.cancelled` to each session's audience (SESSION-GROUP-1) and writes the thread entry. Cancelling these sessions must **not** queue generation (SESSION-GROUP-5's OFF/inactive rule); for a mode switch the new mode's generation runs after the cancel.
- A deleted configuration's leftover sessions keep their `recurrence_id` (no foreign key; same domain, plain id).
- Permissions as SESSION-GROUP-4 (owner/admin; 404 before 403).

**Consumer census:** the cancel path and its notifications, SESSION-GROUP-4's three endpoints (request shape gains `cancelScheduled`), SESSION-GROUP-5's producers, client mirrors. **Account lifecycle:** JWT filter; actor is an active owner/admin.

**Out of scope:** cancelling `ONGOING` sessions, partial selection of sessions, undo.

**Tests:** Spock for the counting scopes; ITs: count per scope, `cancelScheduled=false` leaves sessions, `true` cancels exactly them and notifies each audience once, no regeneration after an OFF-cancel, mode switch then generates the new mode, non-owner refused. Mutation check each requirement.

---
