# SESSION-GROUP-6 · Count and cancel the scheduled regular sessions when the rules change

**Status:** `DONE` (2026-11-19)
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

## Implementation summary (2026-11-19)

**Built as filed**, with the points below.
- **Count:** `GET /api/sessions/group/{groupId}/regular-sessions/count?scope=ALL|RECURRENCE&recurrenceId=` (`RegularSessionScope`, `RegularSessionsCountResponse { count }`), owner or admin (404 `GROUP_NOT_FOUND` first; a plain member 403 `SESSION_GROUP_ADMIN_REQUIRED`; `RECURRENCE` without an id is a 400, a configuration of another group 404 `SESSION_RECURRENCE_NOT_FOUND`). Only `SCHEDULED` and `PREPARING` are counted; an `ONGOING` session never is.
- **The flag:** `UpdateGroupSessionSettingsRequest.cancelScheduled` (turn off or switch the mode), `DELETE .../recurrences/{id}?cancelScheduled=true`. Default is "leave it there". `GroupSessionSettingsResponse.cancelledSessions` and the delete's answer (`{ count }`, it used to carry no data) say how many were cancelled. `GroupSessionConfigService.deleteRecurrence` now takes the flag and returns the count (its callers: the controller and the specs, updated).
- **`RegularSessionCanceller`** (joins the caller's transaction): `CANCELLED`, `cancelReason` (English: "Cancelled because the group turned off regular sessions" / "... switched its regular sessions to weekly|monthly" / "... removed this regular session configuration"), `cancelledBy`, `cancelledAt`, `saveAll`, and `session.group.cancelled` to each session's audience and joined players, the actor excluded (`GroupSessionRecipients`, resolved per session: generation keeps one nearest day, so only a handful of sessions). It **bypasses `cancelSession`** on purpose: that publishes the "regular session ended" event which would queue the next day. A mode switch still publishes `ConfigChanged` (SESSION-GROUP-5), so the new mode's slots are generated after the commit; OFF and delete publish nothing.
- **Mode switch cancels all.** The ticket's parenthetical ("for the mode switch, those of the mode being left") is not implemented: a session carries its `recurrence_id`, not a mode, and the spec says "Switch recurrence mode (all scheduled)"; every scheduled regular session of the group is cancelled. Noted in `session-impl/CLAUDE.md` rule 18.
- A cancel changes nothing about custom sessions, and does not write a thread comment (the same as `cancelSession`).

**Consumer census.** `GroupSessionConfigService.deleteRecurrence` (signature and return type changed; callers `GroupSessionConfigController` and `GroupSessionConfigServiceImplSpec`, updated); `UpdateGroupSessionSettingsRequest` and `GroupSessionSettingsResponse` (one optional field each: compatible); the `DELETE` answer (was `Void`, now carries a count: no client exists yet, CLIENT-GROUP-SESSION-4/5/6 are filed with the contract); `SessionRepository` (four new derived queries); `session.group.cancelled` (existing event, same consumer and the client text of CLIENT-GROUP-SESSION-3); no other module is affected.

**Tests.** `GroupSessionConfigServiceImplSpec` (78: 16 new or changed: OFF and mode switch cancel when asked, the reason texts, nothing is cancelled unless asked or when the call is neither, delete with and without the flag in order cancel-then-delete, the count per scope, 404 and 400, the manager gate), `RegularSessionCancellerSpec` (3), session-impl 617; `RegularSessionCancelIntegrationTest` (9, real pipeline): the count per group and per configuration and never an `ONGOING` session, only an owner or admin counts, OFF with the flag cancels, records who and why, tells exactly the audience minus the actor and the deactivated account, leaves a custom session alone and brings nothing back; without the flag nothing changes; an `ONGOING` session is never cancelled; a mode switch cancels only when asked; delete with and without the flag; a plain member cannot cancel by a rule change. Mutation check: 13 of 13 killed against a passing baseline. **Not run:** the full `:server:test`, a live server.
