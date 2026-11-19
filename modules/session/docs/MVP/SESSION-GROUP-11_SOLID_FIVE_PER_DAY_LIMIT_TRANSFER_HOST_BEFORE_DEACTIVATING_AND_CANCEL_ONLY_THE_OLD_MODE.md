# SESSION-GROUP-11 · A solid 5-per-day limit, transfer the host before deactivating, and a mode switch cancels only the old mode's sessions

**Status:** `TODO`
**Type:** Enhancement (hardening) · **Depends on:** SESSION-GROUP-4, SESSION-GROUP-6 (what it changes), U22/U24 (self deactivation) and `GroupService.transferOwnership` (what it reuses)
**Filed:** 2026-11-19, the owner's answer to the three known limits listed in `modules/session/docs/GROUP_SESSION_DESIGN.md` § 12 (the review of the group-session chain, SESSION-GROUP-10): each one is to be closed, not accepted. One ticket, three independent parts; each can be built and merged on its own.

## 1. The limit of 5 configurations per day is solid, also under a race

**Today:** `createRecurrence` and `updateRecurrence` count the configurations of the (group, mode, day), refuse at 5 or more, then save. Nothing serializes two callers: two admins (or a double click) adding to a day that holds 4 both count 4 and both save, so the day ends with 6.

**Expected:** two simultaneous adds, two simultaneous moves onto a day, or an add and a move, never leave more than 5 on a day (drafts count, as today). The loser gets the same `409 SESSION_RECURRENCE_DAY_LIMIT {limit}` it would get one moment later. Proven by a real-concurrency IT (two threads behind a barrier against a day holding 4, exactly one succeeds) and a mutation check that fails without the guard.

**How (decide at pickup, `/workon` Phase 1):** serialize the check and the save per group, in the same transaction, before the count. Two ways: a Postgres transaction advisory lock, `pg_advisory_xact_lock(namespace, hashtext(key))`, as `UserProvisioningLock` already does in user-impl (A26; it keeps a namespace registry in its class comment, a new use needs its own namespace, and it does nothing on H2, so the IT would need real Postgres or a test seam); or a row lock on the group's `group_session_settings` row (`SELECT ... FOR UPDATE`, which works on H2 and Postgres, so the IT runs as it is; the row is created on first use). Whichever is chosen, the SQL the IT runs must be the SQL production runs. Deleting a configuration needs no lock.

## 2. The host transfers the group before deactivating

**Today:** a user who owns a group can deactivate their account (the user's own call, U22/U24, or the admin's `deleteUser`). The group keeps the deactivated account as its owner: the generator authors regular sessions in their name, and nobody holds the owner role who can act. (`GroupService.resolveGroupOwnerId` takes the member with the owner role and never checks that the account is active.)

**Expected:** an account that is the **owner of a group** cannot be deactivated until the ownership of each such group has been transferred (`GroupService.transferOwnership` already exists). The refusal is a coded error that names how many groups (and which ids) still need a new owner, so the client can send the person to the transfer. After the change no active group has a deactivated owner, so the generator needs no special case.

**Decide at pickup:** (a) a group whose owner is its only member, or has no other member who can take over: it is deactivated (or deleted) with the owner, or the owner must do it first; (b) the admin-initiated `deleteUser` gets the same refusal, or transfers to an admin automatically; (c) what happens to an owner who is already deactivated today (a one-off data fix: transfer to the oldest admin, or leave); (d) the module dependency: user-impl must ask the group domain which groups an account owns (a batch method on `group-api`, not a call per group) without creating a cycle (if `user-impl` cannot depend on `group-api`, the refusal is checked behind an `-api` method or an event). The deactivation flow also needs the per-request `isActive` check and the user-row lock that `deleteUser` already takes, so a transfer and a deactivation cannot interleave.

**Client:** the deactivate-account screen shows the refusal and links to the transfer; that client ticket is filed at pickup (a coded error with en and vi copy, I18N-4 row).

## 3. A mode switch cancels only the sessions of the mode being left

**Today:** `PUT .../settings` with a mode switch and `cancelScheduled = true` cancels **every** scheduled regular session of the group (`findByGroupIdAndRecurrenceIdIsNotNullAndStatusIn`), including any that belong to the mode being switched **to** (left over from an earlier switch where the owner chose "leave it there"). A cancelled slot is never regenerated (the unique key `(recurrence_id, occurrence_date)` counts cancelled sessions), so a session the re-enabled mode should have is lost.

**Expected:** a mode switch with `cancelScheduled` cancels only the `SCHEDULED` and `PREPARING` regular sessions whose recurrence belongs to the **old** mode; the sessions of the new mode stay. Turning generation off still cancels all of them, and deleting a configuration still cancels that configuration's sessions (both unchanged). The count the client shows in the confirmation must be the same set: `GET .../regular-sessions/count` gets a scope for it (for example `scope=MODE`, counting the sessions of the group's **current** mode; `ALL` keeps meaning every one, used for OFF), and the answer of the switch (`cancelledSessions`) matches it.

**Decide at pickup:** a regular session whose recurrence has been deleted (it keeps its `recurrence_id`, there is no row to read the mode from): treat it as belonging to no mode and leave it, or as the old mode's. The mode of a session is read through its recurrence, in one query, not per session.

**Client contract change:** `CLIENT-GROUP-SESSION-6` uses `scope=ALL` for a mode switch today; it moves to the new scope. That ticket and `GROUP_SESSION_DESIGN.md` (§ 4.4, 4.6, 12, 13) are updated in the same change.

**Out of scope:** the queue and the worker (SESSION-GROUP-5, 9); the other scheduled jobs (SESSION-GROUP-7); a limit other than 5.

**Tests:** part 1 the concurrency IT and its mutation check; part 2 an integration test through the real deactivation path (refused with the coded error while the user owns a group, allowed after `transferOwnership`) and the lifecycle check for a deactivated caller; part 3 specs and an IT with sessions of both modes (only the old mode's are cancelled and counted, a deleted recurrence's session handled as decided) and a mutation check.
