# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-09-17

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
| 3 | [SESSION-26](MVP/SESSION-26_DISCOVER_ATTRIBUTE_FILTER.md) | Session-attribute filtering on discover (deferred from SESSION-25) | `TODO` |
| 4 | [SESSION-29](MVP/SESSION-29_OLD_HISTORY_STORAGE_RETENTION_CONCERN.md) | Old `CANCELLED`/`COMPLETED` session storage — retention concern, documented only, no direction decided (revisit once there's real usage/storage data) | `TODO` |
| 5 | [SESSION-34](MVP/SESSION-34_HISTORY_DATE_COUNTS_AT_TIME_ZONE.md) | Rewrite `findHistoryDateCounts` using `AT TIME ZONE`, retiring `zoneOffsetSeconds` — supersedes SESSION-31's reverted point-fix | `TODO` |
| 6 | [SESSION-35](MVP/SESSION-35_DISCOVER_CALLER_ZONE_FILTERS.md) | Rewrite `/discover`'s `date`/`startTime` filters for caller-zone semantics, retiring the `EXTRACT`+`MOD` correction — partially supersedes SESSION-25's timezone mechanics | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [SESSION-33](MVP/SESSION-33_SCHEDULEDSTART_TRUE_INSTANT.md) | `Session.scheduledStart`/`scheduledEndAt` become true instants (`TIMESTAMPTZ`), with a creator-zone `originZoneId` fallback (pinned forever, per user decision) for location-less sessions — foundation for SESSION-34/35. Intentional, non-additive contract break on `scheduledStart`'s wire shape (client must send an offset now); `SessionGenerationService` gained a `LocationService` dependency to resolve auto-generated sessions' zone from their (always-present) recurrence location. `/discover`'s `startTimeFilter` correction left mechanically type-compatible but not truly zone-correct yet — re-verified live (27 cases green), SESSION-35's job to fix properly. Green: `session-impl` (162 tests) + `:server:test` (231 tests) | `DONE` (2026-09-17) |
| 2 | [SESSION-32](MVP/SESSION-32_LOCATION_TIMEZONE_DESIGN.md) | Sessions have no client/location timezone — `scheduledStart` implicitly server-zone; design captured in `documentation/md/LOCATION_TIMEZONE_DESIGN.md` (location-owned zones, `scheduledStart` as a true instant, location-zone-for-bucketing vs. caller-zone-for-filtering split, validated `TIMESTAMP`/`TIMESTAMPTZ` example against real Postgres) and split into concrete tickets: **LOC-4**, **SESSION-33**, **SESSION-34**, **SESSION-35**, **CLIENT-SESSION-24** | `DONE` (2026-09-16) |
| 3 | [SESSION-31](MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md) | `findHistoryDateCounts` misbuckets early-morning sessions onto the wrong calendar date (real, already-shipped timezone bug found while implementing SESSION-25) — a JVM-offset-correction point-fix was implemented and fully verified (H2 + real Postgres, `:server:test` green), then **deliberately reverted before merge** once a follow-up discussion chose a root-cause redesign instead (location-owned timezones, `scheduledStart` as a true instant) over patching this one query. Superseded by **SESSION-34** | `SUPERSEDED` (2026-09-16) |
| 4 | [SESSION-25](MVP/SESSION-25_DISCOVER_SEARCH_AND_FILTER.md) | Server-side search + column filter on session discover — 8 new AND-combined query params on `GET /discover` (title, locationId, minOpenSlots, feeType, maxFeeAmountVnd, date, startTimeFilter+startTime, status), new default status list (`PREPARING`/`SCHEDULED`/`ONGOING`, superseding SESSION-4's `SCHEDULED`-only default — intentional, user-confirmed), `scheduledStart >= now()` default lower bound (skipped when `date`/`startTimeFilter` narrows it), new 3-level sort (`scheduledStart ASC` + open-slots `ASC` + `createdAt ASC`). Adding a permanent IT test (`SessionDiscoverIntegrationTest`, prompted by "do we have enough IT?") found two real bugs no mocked Spock test or `:server:test` H2 run could have caught: (1) a bare `(:param IS NULL OR ...)` null check fails Postgres's parameter-type inference — fixed by casting every optional param defensively; (2) a systemic **timezone bug** — this app's `hibernate.jdbc.time_zone: UTC` shifts stored timestamps on write but only reapplies that shift on plain attribute reads, so any `CAST`/`EXTRACT` applied directly to `scheduledStart` reads the raw, wrong value (confirmed: an `18:00`-local session read back as hour `11` via `EXTRACT`; an early-morning session's `CAST(... AS date)` returned the previous calendar day). Fixed `date` via a half-open `[dayStart, dayEnd)` range (no cast, matching SESSION-27's existing pattern) and `startTime` via `EXTRACT` + a JVM-offset `MOD` correction computed in `SessionServiceImpl` — three earlier attempts (native `time`-typed comparison, string comparison, naively-shifted parameter) each failed a different way before landing on this. Same bug found **already shipped** in SESSION-27's `findHistoryDateCounts` — not fixed here (different ticket), filed as **SESSION-31**. **SESSION-30** (the original CAST-vs-generated-column performance question) is now superseded — the correctness fix made the performance question moot. Green: session-impl (expanded `discoverSessions` Spock) + `SessionDiscoverIntegrationTest` (27 IT cases, H2) + `:server:test` (full suite) + live end-to-end re-verification of every boundary on real Postgres, including the two bugs' exact repro cases | `DONE` (2026-09-15) |
| 5 | [SESSION-30](MVP/SESSION-30_DISCOVER_DATE_TIME_FILTER_GENERATED_COLUMNS.md) | `/discover`'s date/startTime filters: CAST-vs-generated-column performance question — **superseded**: CAST turned out to be a correctness bug (see SESSION-25), not just a performance tradeoff, so neither option applies anymore | `SUPERSEDED` (2026-09-15) |
| 6 | [SESSION-28](MVP/SESSION-28_SESSION_PARTICIPANTS_USER_STATUS_INDEX.md) | Index cleanup, two parts — Part 1 drops redundant `idx_sessions_group_id`/`idx_session_participants_session_id` (`V066`, superseded by existing unique composite indexes); Part 2 adds `session_participants(user_id) WHERE status='JOINED'` (`V067`, partial index — covers 5 of 7 "my sessions"-shaped query consumers directly, `getUpcomingSessions`/`ByDate`'s `INVITED` half correctly falls back to the existing plain `user_id` index). Both verified via `EXPLAIN` on the real dev Postgres. `idx_sessions_created_by`/`idx_sessions_location_id` reviewed, kept not dropped. Green: session-impl + `:server:test`, no Java changed (index-only) | `DONE` (2026-09-15) |
| 7 | [SESSION-27](MVP/SESSION-27_REFACTOR_SESSION_LISTING_UPCOMING_AND_HISTORY.md) | Refactor session listing — replaces `GET /sessions/mine` with `GET /upcoming` (JOINED/INVITED, PREPARING/SCHEDULED/ONGOING, scheduledStart ASC + PREPARING→SCHEDULED→ONGOING tiebreak — scope change at pickup) and `GET /history` (`date`: JOINED-only CANCELLED/COMPLETED, scheduledStart DESC; `dateCount`: distinct history dates + counts, `before` cursor). Both participant-scoped (standalone + group-linked alike), sort non-overridable by the caller. No migration. Green: session-impl (11 new Spock) + new `SessionListingIntegrationTest` (19 IT cases, real H2 round trip) + `:server:test` (195, all passed). Client wiring deferred to already-filed `CLIENT-SESSION-23` | `DONE` (2026-09-15) |
| 8 | [SESSION-24](MVP/SESSION-24_ADD_PREPARING_SESSION_STATUS.md) | Add `PREPARING` session status — `locationId`/`feeType` optional at creation; missing either starts the session `PREPARING` instead of `SCHEDULED`; `updateSession` gains a `PREPARING`-only gate on those two fields plus the completion flip; new `cancelUnpreparedSessions` job auto-cancels a `PREPARING` session past its `scheduledStart`; new `session.details.updated` notification (JOINED participants, any field change) — routing key renamed from the originally-planned `session.updated` after finding `notification-impl`'s queue binds a strict `session.*.*` pattern that a 2-segment key would silently never match. `V065` drops `NOT NULL` on both `sessions.location_id` and `.fee_type`. Green: session-impl (148) + notification-impl + V065 on dev Postgres; `:server:test` not run to completion (~55min, no output — matches the precedent below), deferred to `server-ci` on push | `DONE` (2026-09-14) |
| 9 | [SESSION-23](MVP/SESSION-23_SESSION_ATTRIBUTES.md) | Session attributes (2026-09-07) — `V064` `sessions.attributes` JSONB; `attributes` on create/update requests + `SessionResponse`; `SessionAttributeFilter` (+ cloned `SessionAttributeValues`/`SessionSchemaPaths`) filters submitted maps against `SportService.getSessionAttributeSchemaRaw` with **replace semantics**, 4KB cap → 400; `updateSession` skips the schema fetch when `attributes` is null. Value-validation logic cloned from `sport-impl` (unreachable package-private) — de-dup filed as sport `A23` + common `C5`. Green: session-impl + `:server:test` (179) + V064 on dev Postgres | `DONE` (2026-09-07) |
| 10 | [SESSION-21](MVP/SESSION-21_SYSTEM_COMMENTS_IN_SESSION_THREAD.md) | System comments in the session discussion thread | `DONE` |
| 11 | [SESSION-20](MVP/SESSION-20_COMMENT_NOTIFICATION_STATUS_GATE_BUG.md) | Comment notifications wrongly restricted to SCHEDULED/ONGOING sessions | `DONE` |
| 12 | [SESSION-19](MVP/SESSION-19_NOTIFY_JOINED_PARTICIPANTS_ON_LEAVE.md) | Notify JOINED participants when a participant leaves | `DONE` |
| 13 | [SESSION-18](MVP/SESSION-18_NOTIFY_JOINED_PARTICIPANTS_WHEN_A_SESSION_TRANSITIONS_TO.md) | Notify JOINED participants when a session transitions to ONGOING | `DONE` |
| 14 | [SESSION-16](MVP/SESSION-16_FIX_JOINSESSION_DEMOTING_AN_ALREADY_JOINED_CALLER_BACK.md) | Fix `joinSession` demoting an already-`JOINED` caller back to `REQUESTED` | `DONE` |
| 15 | [SESSION-17](MVP/SESSION-17_OUTBOX_PENDING_PARTIAL_INDEX.md) | Partial index on `session_outbox_events` scoped to `status = 'PENDING'` | `DONE` |
| 16 | [SESSION-14](MVP/SESSION-14_REDUCE_MAPTORESPONSES_ROUND_TRIPS.md) | Reduce `mapToResponses`' round trips (2 points) | `DONE` |
| 17 | [SESSION-15](MVP/SESSION-15_NOTIFICATION_OUTBOX_WIRING.md) | Notification outbox wiring — closes NOTIF-1 | `DONE` |
| 18 | [SESSION-10](MVP/SESSION-10_SESSION_POST_COMMENTS.md) | Session comments — reuses post-impl's Comment via a companion `SESSION_POST` anchor | `DONE` |
| 19 | [SESSION-12](MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md) | Partial index on `sessions` scoped to `status = SCHEDULED` for the generation job's hot queries | `DONE` |
| 20 | [SESSION-13](MVP/SESSION-13_SESSIONRESPONSE_LIKECOUNT_ISLIKEDBYCURRENTUSER_POSTSERVICE_G.md) | `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method | `DONE` |
| 21 | [SESSION-11](MVP/SESSION-11_DROP_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on session tables' cross-domain columns | `DONE` |
| 22 | [SESSION-9](MVP/SESSION-9_CALLER_PARTICIPATION_STATUS.md) | Expose the caller's own participant status (any status) via getSessionParticipants | `DONE` |
| 23 | [SESSION-4](MVP/SESSION-4_STANDALONE_DISCOVERY.md) | Standalone session discovery — browse/join sessions you didn't create | `DONE` |
| 24 | [SESSION-5](MVP/SESSION-5_CAPACITY_AND_FEE.md) | Session capacity + fee/pricing | `DONE` |
| 25 | [SESSION-6](MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md) | Join-approval workflow + invite-friends-at-creation | `DONE` |
| 26 | [SESSION-7](MVP/SESSION-7_PARTIAL_INDEX_ON_SESSIONS_SPORT_ID.md) | Partial index on `sessions.sport_id` for standalone sport filtering | `DONE (bundled into SESSION-4)` |
| 27 | [SESSION-1](MVP/SESSION-1_SESSION_DOMAIN_CORE.md) | Session domain core — manual create/join/leave, group or standalone | `DONE` |
| 28 | [SESSION-2](MVP/SESSION-2_SCHEDULED_AUTO_GENERATION_JOB.md) | Scheduled auto-generation job for group-recurring sessions | `DONE` |
| 29 | [SESSION-3](MVP/SESSION-3_FULL_STATUS_LIFECYCLE.md) | Full status lifecycle (ONGOING, CANCELLED) + cancel reason/who/when | `DONE` |
