# Group sessions: design and server contract

**Status:** server side built and reviewed (2026-11-19); client side not started (`CLIENT-GROUP-SESSION-1` to `6`).
**What to build (the owner's words):** `modules/session/docs/GROUP_SESSION_SPECIFICATION.md`. This document is **how it was built** and **what the client can rely on**. When this document and a ticket disagree, this document wins (it was written after the review, `SESSION-GROUP-10`).
**Tickets:** server `SESSION-GROUP-1` to `6`, `GROUP-1` (group backlog), `SESSION-GROUP-10` (review); follow-ups `SESSION-GROUP-7`, `8`, `9` (TODO); client `CLIENT-GROUP-SESSION-1` to `6`.
**Where the rest lives:** rules 15 to 18 in `modules/session/session-impl/CLAUDE.md` (the server rules, the most exact), `documentation/md/ERROR_CODES.md` (codes), `documentation/md/NOTIFICATION_USE_CASES.md` (NOTIF-14, 15), `PROGRESS.md` (history), `documentation/release-notes/SERVER.md` (deploy notes).

---

## 1. The two kinds of group session

| | Custom session | Regular session |
|---|---|---|
| Made by | any member of the group, by hand (`POST /api/sessions` with a `groupId`) | the server, from a recurrence configuration (author = the group's current owner) |
| Managed by | its creator **while still a member**, and the group's owner and admins | the group's owner and admins (the owner is the author) |
| Told apart by | `sessions.recurrence_id` is **null** | `sessions.recurrence_id` is **set** (plus `occurrence_date`) |
| Common to both | `groupId` set, `sessionType = GROUP_RECURRING` (the name is misleading for a custom one), `isPublic = false`, `autoApprove` true by default, sport = the group's | |

**The client cannot tell them apart.** `SessionResponse` has no `recurrenceId`, no `regular` flag and no audience (the owner left it so: add a field only when a client ticket needs it). Everything in the UI that differs between the two (cancel prompts, the settings list) comes from the settings endpoints, not from a session.

A group session is **never public**: only members can read it (`SessionDetailGate`), join it, share it, comment on it.

## 2. Decisions (owner, 2026-11-18 and 2026-11-19)

1. The old single weekly recurrence rule on the group is **replaced, not migrated** (GROUP-1, V097): a group that had one sets it up again.
2. The unique key `unique_group_session_start (group_id, scheduled_start)` is dropped: two sessions of a group may start together.
3. A monthly day 29, 30 or 31 **skips** a month that lacks it; it never falls on the last day.
4. A custom session is managed by its creator (while a member) and by owner and admins.
5. **Generation trigger:** the last *regular* session of a day completes or is cancelled. A custom session never triggers generation. Cancelling while generation is OFF never regenerates.
6. **Time:** a configuration is a wall-clock slot (a weekday or month day, a local start time, a duration) read in the **location's timezone**; the session is stored as a UTC instant. "Today", "nearest day" and "already ended" are judged on that wall clock.
7. **Audience** (all members, or chosen members, no cap) decides **only who is notified**, at creation and at generation (`session.group.created`) and at cancel (`session.group.cancelled`). Every member can still see and join; a member becomes a participant by clicking Join. No `INVITED` row is made.
8. A group's `PREPARING` sessions are their own bucket, never mixed into `SCHEDULED`.
9. A configuration is a **draft** when it lacks a location, a duration, or (for a `FIXED` fee) the amount. A day and a start time are required.
10. Editing a configuration changes only **future** generation; generated sessions keep their values.
11. Every change of the group's session rules writes a **group system post**, authored as the current owner (the B9 rule).
12. Sharing a group session: any member, recipients are the group's other **active** members, others skipped and counted, cap 50.
13. **Review (SESSION-GROUP-10):** the audience is stored on the row, not in a table; `group_session_settings` stays in the session domain (a setting lives with the domain whose behaviour it changes; one several modules must obey, such as group privacy, is the group's); the slot's identity is its **local date**; one authoritative slot per recurrence.
14. **Generation is asynchronous**: a save never waits for it (see section 6).

## 3. Data model (final, after V094 to V100)

All in the session domain; ids of other domains (`group_id`, `location_id`, `user_id`) have no foreign key.

| Table or column | What | Migration |
|---|---|---|
| `sessions.group_audience` | `ALL_MEMBERS` or `SPECIFIC`; null for standalone and older group sessions (read as all members) | V094 |
| `sessions.group_audience_user_ids` | the chosen members of a `SPECIFIC` audience, comma-separated UUIDs in one TEXT column, unique in Java (`UuidListConverter`), read only at a cancel | V098 (replaced the table `session_audience_members`) |
| `sessions.recurrence_id`, `occurrence_date` | the recurrence and the local date a regular session was generated for; unique index `(recurrence_id, occurrence_date)` is the duplicate guard (it counts cancelled sessions too: a cancelled slot is never regenerated) | V096 |
| index `idx_sessions_group_scheduled_start` | non-unique, replaces the dropped unique key | V094 |
| `group_session_settings` | one row per group (none = off, `WEEKLY`): `enabled`, `mode` | V095 |
| `group_session_recurrences` | one configuration: `mode`, `day_key` (1 to 7 weekly, 1 to 31 monthly), `start_time` (local), `duration_minutes`, `location_id`, `location_note`, `audience`, `audience_user_ids`, fee fields, `game_mood`, `attributes`, `is_draft` | V095, V099 |
| `group_session_generation_queue` | the slots still to generate: `(recurrence_id, occurrence_date)` unique, `target_start` (the order key), `status`, `ignored_reason`, `attempts`, `next_attempt_at`, `last_error`, `last_attempt_at` | V096, V100 |
| removed | `groups.recurrence_*` (five columns) and `group_settings.auto_generate_sessions` | V097 (**drops data**) |

A configuration belongs to the mode that was current when it was created and is **active** only while the group's mode equals it. Switching the mode touches no configuration row.

## 4. API contract

All answers are wrapped in `ApiResponse<T>`. Every endpoint needs a Bearer token. A missing or inactive group is `404 GROUP_NOT_FOUND`, answered **before** any permission answer.

### 4.1 Create a group session: `POST /api/sessions`
The standalone request plus:

| Field | Rule |
|---|---|
| `groupId` | present = a group session. The caller must be a member (`403 SESSION_GROUP_MEMBER_REQUIRED`). |
| `sportId` | ignored when the group has a sport (the group's is used); required only for a group with no sport (`400 SESSION_SPORT_REQUIRED`) |
| `audience` | `ALL_MEMBERS` (default) or `SPECIFIC` |
| `audienceUserIds` | with `SPECIFIC`: at least one other member, no upper limit, every id a member of the group, the creator and repeats ignored. `400 SESSION_AUDIENCE_REQUIRED`, `400 SESSION_AUDIENCE_NOT_MEMBER {count}` (nothing is written). Ignored for `ALL_MEMBERS`. |
| `autoApprove` | optional; **defaults to `true` for a group session** (a standalone one still `false`) |
| `isPublic` | ignored (always false) |

The creator is `JOINED` at creation. The answer is the usual `SessionResponse`, which does **not** carry the audience. The audience is notified (`session.group.created`, section 7).

### 4.2 A group's sessions by bucket: `GET /api/sessions/group/{groupId}?bucket=&page=&size=`
Member only (`403 SESSION_GROUP_MEMBER_REQUIRED`, one answer for a non-member).

| `bucket` | Statuses | Order |
|---|---|---|
| `ONGOING` | `ONGOING` | start time, soonest first |
| `SCHEDULED` | `SCHEDULED` | start time, soonest first |
| `PREPARING` | `PREPARING` | start time, soonest first |
| `HISTORY` | `COMPLETED`, `CANCELLED` | start time, newest first |
| omitted | every status, as before | |

The caller's own `sort` is ignored. An unknown `bucket` is an **un-coded** `400`. The answer is a page of `SessionResponse`. The client hides the taken and open slot information for a group session itself.

### 4.3 Change, cancel, schedule, share
- `PUT /api/sessions/{id}`, `POST .../schedule`, `POST .../cancel`: the creator **while still a member**, or the group's owner or admin; otherwise `403 SESSION_GROUP_ADMIN_REQUIRED`. Unchanged rules for `PREPARING`.
- A cancel tells the session's audience and its `JOINED` players (`session.group.cancelled`).
- `POST /api/sessions/{id}/shares` with `{ userIds }` on a group session: any member of the group (`403 SESSION_GROUP_MEMBER_REQUIRED` otherwise), in any status. Recipients are other members of **the group**, not friends; anyone outside the group, deactivated, repeated or already in the session is skipped and counted (`{ sent, skipped }`); 1 to 50 ids.

### 4.4 Settings: `/api/sessions/group/{groupId}/settings`
| Call | Who | Body | Answer |
|---|---|---|---|
| `GET` | any member | none | `{ groupId, enabled, mode }` (`enabled` false and `WEEKLY` when never saved) |
| `PUT` | owner or admin (`403 SESSION_GROUP_ADMIN_REQUIRED`) | partial `{ enabled?, mode?, cancelScheduled? }` | `{ groupId, enabled, mode, cancelledSessions }` |

A real change writes a group system post (section 8) and may trigger generation; a no-op writes nothing. `cancelScheduled` counts only when the call turns generation **off** or **switches the mode**; then every scheduled regular session of the group is cancelled in the same transaction (audience and players told). Switching the mode changes no configuration.

### 4.5 Recurrence configurations: `/api/sessions/group/{groupId}/recurrences`
| Call | Who | Notes |
|---|---|---|
| `GET` | any member | every configuration of **both** modes, ordered by mode, day, start time; each carries `mode`, `draft`, `missing` |
| `POST` | owner or admin | takes the group's **current** mode; `201` |
| `PUT /{id}` | owner or admin | full replace; the mode never changes |
| `DELETE /{id}[?cancelScheduled=true]` | owner or admin | hard delete; answer `{ count }` = how many sessions were cancelled |

Request (`POST` and `PUT`): `dayKey`, `startTime` (`HH:mm`), `durationMinutes`, `locationId`, `locationNote` (500), `audience`, `audienceUserIds`, `feeType` (default `FREE`), `feeAmountVnd`, `feeNote` (300), `gameMood` (1 to 10, default 5), `attributes`. Response adds `id`, `groupId`, `mode`, `draft`, `missing`, `createdAt`, `updatedAt`.

Rules: `dayKey` 1 to 7 (Monday = 1) for `WEEKLY`, 1 to 31 for `MONTHLY` (`400 SESSION_RECURRENCE_DAY_INVALID {mode}`); `startTime` required (`400 SESSION_RECURRENCE_START_REQUIRED`); `missing` names why a configuration is a draft (`locationId`, `durationMinutes`, `feeAmountVnd`); at most **5 per group, mode and day, drafts included** (`409 SESSION_RECURRENCE_DAY_LIMIT {limit}`); the location's sport must equal the group's (`400 GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`); a `SPECIFIC` audience must be members (`400 SESSION_AUDIENCE_*`); unknown id or another group's: `404 SESSION_RECURRENCE_NOT_FOUND`. Every add, replace and delete also writes a group system post and asks for generation.

### 4.6 Count before cancelling: `GET /api/sessions/group/{groupId}/regular-sessions/count?scope=ALL|RECURRENCE&recurrenceId=`
Owner or admin. `{ count }` of `SCHEDULED` or `PREPARING` regular sessions: `ALL` for turning generation off and for a mode switch, `RECURRENCE` plus the id for a delete. An `ONGOING` session and every custom session are never counted or cancelled. The client shows "X sessions are available, do you want to cancel them?" and sends the answer as `cancelScheduled`.

## 5. What the client must know about a configuration
- A draft is saved, listed with its `missing` fields, and never generated.
- Switching the mode leaves every configuration as it is; the client shows the other mode's as "not usable until you switch back".
- The 5-per-day limit is checked on add and on moving a configuration to another day.
- A group with no sport cannot have configurations (`400 SESSION_SPORT_REQUIRED`).
- Read = any member; write = owner or admin (a plain member `403 SESSION_GROUP_ADMIN_REQUIRED`, a non-member `403 SESSION_GROUP_MEMBER_REQUIRED`).

## 6. How a regular session is generated

**What is generated.** With generation **on**, the group's configurations that are **complete** (not draft, with a location and a duration) and of the group's **current mode**. For each, its next slot: the first one that has not ended yet, today's if it is still ahead or under way. Per group only the **nearest day** is kept queued; each regular session's end queues the next day.

**What the session is.** Author = the group's current owner; title "{group name}'s session" (in the owner's language); `SCHEDULED` if the slot has not started, `ONGOING` if it is under way; `autoApprove` true; `isPublic` false; the configuration's location, fee, mood and attributes; the audience copied from the configuration at that moment (a later edit never changes a generated session); a companion post; the audience is told with `session.group.created` (the owner is not told).

**When it happens.**
1. **Server start:** every group with generation on gets its nearest day queued (down-time recovery).
2. **A regular session completes or is cancelled** and the group holds no other open regular session for that local date: its next nearest day is queued.
3. **An owner or admin switches generation on, switches the mode, or adds or edits a configuration:** today's slots that have not ended are queued, and, only if there are none, the nearest later day (unless a regular session is already open before it).
4. **Every 60 seconds** a safety net retries failed slots and picks up slots another instance left behind.

**It is asynchronous.** A trigger plans the slot at once and hands the work to a background worker, so the save, the cancel or the restart answers **before** the session exists. The session appears moments later (normally within seconds, not measured; longer if the queue is crowded or a slot is retrying). **The client says "saved, your sessions will appear shortly" (en and vi) and refetches the group's sessions after a short delay or on the next visit to the Sessions tab.** There is no field or code to say it is pending; a failed slot is retried (1, 5, 15 and 60 minutes, then given up) and never reaches the caller.

**Never generated (and why).** A cancelled slot is never regenerated (the unique key counts it). Generation off queues nothing. A slot whose date no longer falls on the configuration's day (the owner moved the day while it was queued) is ignored. A draft, a configuration of the other mode, an inactive group, or a slot that has ended is ignored.

## 7. Notifications (server events and what the client shows)

Two outbox events, three words each (the notification queue is bound to `session.*.*`), one row per recipient, written in the same transaction as the change. The notification's `type` is the routing key; it carries the **session id** and the actor (the person who made the change); the group id is **not** carried (the client opens the session by id).

| `type` | When | Recipients |
|---|---|---|
| `session.group.created` | a member creates a group session; the generator creates a regular one | the audience (all current members, or the chosen ones who are still members), minus the creator (minus the owner for a generated one); active accounts only |
| `session.group.cancelled` | a group session is cancelled by a person, or by a rule change (generation off, mode switch, deleted configuration) | the audience plus everyone `JOINED`, minus the actor; same filters |
| `session.share.created` | a session is shared | the chosen recipients (unchanged) |

A standalone cancel and the automatic cancel of an unprepared `PREPARING` session notify nobody. Client work: the two new `NotificationType` values, their texts and `enums.json` entries (en and vi), in `CLIENT-GROUP-SESSION-3`.

## 8. Group system posts (the client renders them from the code)

Written as `GROUP_SYSTEM` posts, authored as the current owner, with the English text as a fallback until the client has its copy. `systemCode` and `systemParams` are on the post (`PostResponse`):

| `systemCode` | `systemParams` |
|---|---|
| `GROUP_SESSION_GENERATION_ON`, `GROUP_SESSION_GENERATION_OFF` | `name` (the actor), `mode` |
| `GROUP_SESSION_MODE_CHANGED` | `name`, `mode` (the new one) |
| `GROUP_SESSION_RECURRENCE_ADDED`, `_UPDATED`, `_DELETED` | `name`, `mode`, `day` (a number: 1 to 7 or 1 to 31), `time` (`HH:mm`, empty if none) |

## 9. Error codes the client needs copy for (en and vi, `errors:codes`)

`SESSION_GROUP_MEMBER_REQUIRED`, `SESSION_GROUP_ADMIN_REQUIRED`, `SESSION_AUDIENCE_REQUIRED`, `SESSION_AUDIENCE_NOT_MEMBER {count}`, `SESSION_RECURRENCE_DAY_INVALID {mode}`, `SESSION_RECURRENCE_START_REQUIRED`, `SESSION_RECURRENCE_DAY_LIMIT {limit}`, `SESSION_RECURRENCE_NOT_FOUND`, `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`, `GROUP_NOT_FOUND`, `SESSION_SPORT_REQUIRED`, `SESSION_SHARE_NOT_ALLOWED`. Meanings and params: `documentation/md/ERROR_CODES.md`. A bad `bucket` is deliberately un-coded.

## 10. Deactivated accounts

A deactivated account is refused on every authenticated request. Recipients of a notification and of a share are filtered to **active** accounts (`getActiveUserIds`); names shown (an author, an actor) include deactivated accounts, so the real name is shown. Open question: a deactivated **owner** still authors generated sessions (section 12).

## 11. The queue, for server developers

Statuses: `PENDING` (waits to be generated), `DONE` (**a session exists**), `FAILED` (gave up after 5 attempts; revived by the planner), `IGNORED` (skipped, with `ignored_reason`: `OUTDATED`, `SUPERSEDED`, `GENERATION_OFF`, `RECURRENCE_INACTIVE`, `GROUP_INACTIVE`; revived by the planner when the slot is wanted again).

- **Identity** is `(recurrence_id, occurrence_date)`, the local date; `target_start` (an instant) only orders the queue, drained soonest first.
- **Planner** (`GroupSessionGenerationPlanner`): `NOT_SUPPORTED`; writes one slot at a time through `GroupSessionQueueWriter` (each its own `REQUIRES_NEW` transaction): ignore the recurrence's other `PENDING` slots (`OUTDATED` if their start passed, else `SUPERSEDED`), insert (a unique-key violation from a concurrent planner is absorbed and logged at INFO as `queue race absorbed`), refresh a `PENDING` slot's `target_start`, or revive a `FAILED`/`IGNORED` row with a compare-and-set update.
- **Generator** (`GroupSessionOccurrenceGenerator`, one slot per `REQUIRES_NEW` transaction): first `SELECT ... FOR UPDATE SKIP LOCKED` on the slot (a slot another runner holds is skipped), then the guards (recurrence complete, generation on and the same mode, group active, **the date still falls on the recurrence's day rule**, the slot has not ended, no session yet), then the session, the post and the events. `recordFailure` takes the same lock.
- **Worker** (`GroupSessionGenerationWorker`): one thread per instance, a queue of one with a discard policy (nudges coalesce), nudged by the listener after it plans, and by `GroupSessionGenerationDrainJob` every 60 seconds. Properties `app.session.generation.async` and `app.session.generation.safety-net` (default true; false in the test profile).
- **Instances:** share the queue through the row lock; the unique indexes on the queue and on `sessions (recurrence_id, occurrence_date)` stay as the backstop.
- Scaling the worker with the backlog: `SESSION-GROUP-9`. Pruning old rows: `SESSION-GROUP-8`. The other scheduled session jobs have no multi-instance lock: `SESSION-GROUP-7`.

## 12. Known limits and open decisions

- **5 per day is not locked.** Two admins adding to the same day at the same moment (each sees 4) can both succeed and leave 6. Generation copes with any number; further adds are refused. To be closed by `SESSION-GROUP-11` part 1.
- **A deactivated owner still authors generated sessions.** The author is the member with the owner role; nothing checks that account is active. Generation continues in their name (their real name is shown); only the other admins can manage those sessions. To be closed by `SESSION-GROUP-11` part 2: an owner must transfer the group before deactivating.
- **A mode switch with `cancelScheduled` cancels all** the group's scheduled regular sessions, including any that belong to the mode being switched **to** (it can have some left from an earlier switch where the owner chose "leave it there"); a cancelled slot is not regenerated. This is what the specification says ("all scheduled"); the owner wants only the left mode's cancelled, `SESSION-GROUP-11` part 3 (it changes the count scope the client uses in `CLIENT-GROUP-SESSION-6`).
- Assumptions the owner accepted: the creator is `JOINED`; every cancel of a group session notifies its audience; a bad `bucket` is an un-coded 400; a non-member who shares gets `SESSION_GROUP_MEMBER_REQUIRED`.
- **Not verified:** the migrations V094 to V100 and the lock statement on PostgreSQL (the integration tests run H2), two real instances, a live server with the worker and the safety net on, the full `:server:test`, and the plan of the bucket query on real data.

## 13. Client tickets and the contract they use

| Ticket | Uses | Localize (en and vi) |
|---|---|---|
| `CLIENT-GROUP-SESSION-1` create a session in a group | 4.1; the member picker uses the group member search (`GET /api/groups/{id}/members/search`, B23) | errors `SESSION_GROUP_MEMBER_REQUIRED`, `SESSION_AUDIENCE_REQUIRED`, `SESSION_AUDIENCE_NOT_MEMBER` |
| `CLIENT-GROUP-SESSION-2` Sessions tab | 4.2; hides taken and open slots itself; no regular or custom field | tab and bucket titles, empty states |
| `CLIENT-GROUP-SESSION-3` share and notification texts | 4.3, 7 | `session.group.created` and `session.group.cancelled` texts, `SESSION_GROUP_MEMBER_REQUIRED` for a share |
| `CLIENT-GROUP-SESSION-4` settings section | 4.4, 4.5 (list), 5, 6 (asynchronous), 8 | the six `GROUP_SESSION_*` post texts, errors of 4.4 and 4.5 |
| `CLIENT-GROUP-SESSION-5` recurrence form | 4.5, 5, 6 (asynchronous) | all form copy, `SESSION_RECURRENCE_*`, `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH` |
| `CLIENT-GROUP-SESSION-6` cancel confirmations | 4.4 (`cancelScheduled`), 4.5 (delete), 4.6 (count) | the three confirmation texts |

Each ticket also adds its row to the I18N-4 census in `documentation/md/I18N_READINESS.md` when it shows a server error.
