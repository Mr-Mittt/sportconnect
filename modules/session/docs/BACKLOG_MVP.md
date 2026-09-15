# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-09-15

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SESSION-8](MVP/SESSION-8_SESSION_DISCOVER_RANKING_ALGORITHM.md) | Session discover ranking algorithm | `TODO` |
| 2 | [SESSION-22](MVP/SESSION-22_FLAKY_SESSION_EVENTS_CONSUMER_RABBITMQ_IT.md) | `SessionEventsConsumerIntegrationTest` fails intermittently on its RabbitMQ container — **~50% flake rate** (6 of 12 full runs), fails as a block on `AmqpIOException`, passes in isolation | `TODO` |
| 3 | [SESSION-25](MVP/SESSION-25_DISCOVER_SEARCH_AND_FILTER.md) | Server-side search + column filter on session discover | `TODO` |
| 4 | [SESSION-26](MVP/SESSION-26_DISCOVER_ATTRIBUTE_FILTER.md) | Session-attribute filtering on discover (deferred from SESSION-25) | `TODO` |
| 5 | [SESSION-28](MVP/SESSION-28_SESSION_PARTICIPANTS_USER_STATUS_INDEX.md) | Index cleanup — drop redundant `idx_sessions_group_id`/`idx_session_participants_session_id` (**done**, `V066`) + add `session_participants(user_id, status)` (still open, not decided) | `TODO` |
| 6 | [SESSION-29](MVP/SESSION-29_OLD_HISTORY_STORAGE_RETENTION_CONCERN.md) | Old `CANCELLED`/`COMPLETED` session storage — retention concern, documented only, no direction decided (revisit once there's real usage/storage data) | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SESSION-27](MVP/SESSION-27_REFACTOR_SESSION_LISTING_UPCOMING_AND_HISTORY.md) | Refactor session listing — replaces `GET /sessions/mine` with `GET /upcoming` (JOINED/INVITED, PREPARING/SCHEDULED/ONGOING, scheduledStart ASC + PREPARING→SCHEDULED→ONGOING tiebreak — scope change at pickup) and `GET /history` (`date`: JOINED-only CANCELLED/COMPLETED, scheduledStart DESC; `dateCount`: distinct history dates + counts, `before` cursor). Both participant-scoped (standalone + group-linked alike), sort non-overridable by the caller. No migration. Green: session-impl (11 new Spock) + new `SessionListingIntegrationTest` (19 IT cases, real H2 round trip) + `:server:test` (195, all passed). Client wiring deferred to already-filed `CLIENT-SESSION-23` | `DONE` (2026-09-15) |
| 2 | [SESSION-24](MVP/SESSION-24_ADD_PREPARING_SESSION_STATUS.md) | Add `PREPARING` session status — `locationId`/`feeType` optional at creation; missing either starts the session `PREPARING` instead of `SCHEDULED`; `updateSession` gains a `PREPARING`-only gate on those two fields plus the completion flip; new `cancelUnpreparedSessions` job auto-cancels a `PREPARING` session past its `scheduledStart`; new `session.details.updated` notification (JOINED participants, any field change) — routing key renamed from the originally-planned `session.updated` after finding `notification-impl`'s queue binds a strict `session.*.*` pattern that a 2-segment key would silently never match. `V065` drops `NOT NULL` on both `sessions.location_id` and `.fee_type`. Green: session-impl (148) + notification-impl + V065 on dev Postgres; `:server:test` not run to completion (~55min, no output — matches the precedent below), deferred to `server-ci` on push | `DONE` (2026-09-14) |
| 3 | [SESSION-23](MVP/SESSION-23_SESSION_ATTRIBUTES.md) | Session attributes (2026-09-07) — `V064` `sessions.attributes` JSONB; `attributes` on create/update requests + `SessionResponse`; `SessionAttributeFilter` (+ cloned `SessionAttributeValues`/`SessionSchemaPaths`) filters submitted maps against `SportService.getSessionAttributeSchemaRaw` with **replace semantics**, 4KB cap → 400; `updateSession` skips the schema fetch when `attributes` is null. Value-validation logic cloned from `sport-impl` (unreachable package-private) — de-dup filed as sport `A23` + common `C5`. Green: session-impl + `:server:test` (179) + V064 on dev Postgres | `DONE` (2026-09-07) |
| 4 | [SESSION-21](MVP/SESSION-21_SYSTEM_COMMENTS_IN_SESSION_THREAD.md) | System comments in the session discussion thread | `DONE` |
| 5 | [SESSION-20](MVP/SESSION-20_COMMENT_NOTIFICATION_STATUS_GATE_BUG.md) | Comment notifications wrongly restricted to SCHEDULED/ONGOING sessions | `DONE` |
| 6 | [SESSION-19](MVP/SESSION-19_NOTIFY_JOINED_PARTICIPANTS_ON_LEAVE.md) | Notify JOINED participants when a participant leaves | `DONE` |
| 7 | [SESSION-18](MVP/SESSION-18_NOTIFY_JOINED_PARTICIPANTS_WHEN_A_SESSION_TRANSITIONS_TO.md) | Notify JOINED participants when a session transitions to ONGOING | `DONE` |
| 8 | [SESSION-16](MVP/SESSION-16_FIX_JOINSESSION_DEMOTING_AN_ALREADY_JOINED_CALLER_BACK.md) | Fix `joinSession` demoting an already-`JOINED` caller back to `REQUESTED` | `DONE` |
| 9 | [SESSION-17](MVP/SESSION-17_OUTBOX_PENDING_PARTIAL_INDEX.md) | Partial index on `session_outbox_events` scoped to `status = 'PENDING'` | `DONE` |
| 10 | [SESSION-14](MVP/SESSION-14_REDUCE_MAPTORESPONSES_ROUND_TRIPS.md) | Reduce `mapToResponses`' round trips (2 points) | `DONE` |
| 11 | [SESSION-15](MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md) | Notification outbox wiring — closes NOTIF-1 | `DONE` |
| 12 | [SESSION-10](MVP/SESSION-10_SESSION_POST_COMMENTS.md) | Session comments — reuses post-impl's Comment via a companion `SESSION_POST` anchor | `DONE` |
| 13 | [SESSION-12](MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md) | Partial index on `sessions` scoped to `status = SCHEDULED` for the generation job's hot queries | `DONE` |
| 14 | [SESSION-13](MVP/SESSION-13_SESSIONRESPONSE_LIKECOUNT_ISLIKEDBYCURRENTUSER_POSTSERVICE_G.md) | `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method | `DONE` |
| 15 | [SESSION-11](MVP/SESSION-11_DROP_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on session tables' cross-domain columns | `DONE` |
| 16 | [SESSION-9](MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md) | Expose the caller's own participant status (any status) via getSessionParticipants | `DONE` |
| 17 | [SESSION-4](MVP/SESSION-4_STANDALONE_DISCOVERY.md) | Standalone session discovery — browse/join sessions you didn't create | `DONE` |
| 18 | [SESSION-5](MVP/SESSION-5_CAPACITY_AND_FEE.md) | Session capacity + fee/pricing | `DONE` |
| 19 | [SESSION-6](MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md) | Join-approval workflow + invite-friends-at-creation | `DONE` |
| 20 | [SESSION-7](MVP/SESSION-7_PARTIAL_INDEX_ON_SESSIONS_SPORT_ID.md) | Partial index on `sessions.sport_id` for standalone sport filtering | `DONE (bundled into SESSION-4)` |
| 21 | [SESSION-1](MVP/SESSION-1_SESSION_DOMAIN_CORE.md) | Session domain core — manual create/join/leave, group or standalone | `DONE` |
| 22 | [SESSION-2](MVP/SESSION-2_SCHEDULED_AUTO_GENERATION_JOB.md) | Scheduled auto-generation job for group-recurring sessions | `DONE` |
| 23 | [SESSION-3](MVP/SESSION-3_FULL_STATUS_LIFECYCLE.md) | Full status lifecycle (ONGOING, CANCELLED) + cancel reason/who/when | `DONE` |
