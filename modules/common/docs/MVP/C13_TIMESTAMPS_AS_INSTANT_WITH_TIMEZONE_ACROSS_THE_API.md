# C13 · Store and send every timestamp as an instant (`timestamptz` + `Instant`), not a zone-less `LocalDateTime`

**Status:** `TODO`
**Module:** `modules/common` (cross-cutting: the change lands in every domain that has the pattern; the migration is in `server`)
**Type:** Bug Fix / Enhancement (Architecture), application-wide
**Depends on:** none
**Filed:** 2026-11-13, found while checking CLIENT-GL-38 in the browser: a session created at 07:13 UTC showed its auto comment "bao joined the session" as "7 hours ago". The owner chose to file the proper fix and wait on it.

## The defect (root cause, verified 2026-11-13 on the dev database)

The stored values are right: the dev Postgres runs in `Etc/UTC`, `comments.created_at` of session 13299's comments was 07:15:49 while `now()` was 07:20 UTC (`TimeZone.setDefault(UTC)` in `SportConnectApplication.main()` and `hibernate.jdbc.time_zone: UTC` work). The defect is what is sent to the browser:

- 68 columns across the schema (`posts`, `comments`, `sessions.created_at / updated_at / cancelled_at`, `session_participants`, `groups`, `notifications`, `users`, ...) are `timestamp without time zone`; the entities and the response DTOs use `LocalDateTime` (22 API classes, e.g. `PostResponse`, `CommentResponse`, `SessionResponse`, `NotificationResponse`, `GroupResponse`, `UserResponse`).
- Jackson writes a `LocalDateTime` as `"2026-11-13T07:15:49.68"`: no `Z`, no offset. The browser's `new Date(...)` reads such a string as **local** time (`client/src/shared/lib/relativeTime.ts:16` and every other formatter), so a viewer in UTC+7 sees every post, comment, notification and "joined" time 7 hours in the past.
- Only the session scheduling fields are right (`scheduled_start`, `scheduled_end_at` are `timestamptz` / `Instant`, SESSION-33 and the sessions `Instant` work), so the bug hides in any UTC test environment.

## What to do

1. **Migration (Liquibase, `server`):** every user-facing `timestamp without time zone` column becomes `timestamptz` (`ALTER COLUMN ... TYPE timestamptz USING <col> AT TIME ZONE 'UTC'`), with `DEFAULT CURRENT_TIMESTAMP` unchanged. **Check the data first:** rows written before the JDBC time zone fix (memory: `project_jdbc_session_timezone_fix`) were stored in the host's time zone, not UTC, so decide per table whether `AT TIME ZONE 'UTC'` is right for old rows (compare a few old rows with their known creation time) or whether a one-off correction is needed. Columns that no client ever sees (`databasechangelog.*`, outbox bookkeeping) are optional.
2. **Entities and DTOs:** `LocalDateTime` becomes `Instant` (entities, `*-api` response and request DTOs, mappers, JPQL/native queries that compare with `LocalDateTime.now()`, the services that call `LocalDateTime.now()`; the session module already uses an injected `Clock`: follow it). Jackson then writes `...Z`.
3. **Triggers:** `update_updated_at_column()` (posts, comments and other tables) must keep working on `timestamptz`.
4. **Cross-service:** the domain events and the chat sync payloads (`documentation/md` sync design, `services/chat`) carry some of these timestamps: check each producer and consumer (Go side parses RFC 3339?).
5. **Client:** the types stay `string`; nothing to change except tests and MSW fixtures that use offset-less literals (`'2026-08-01T19:00:00'`), which should become offset-aware so they match the real wire format (the visual-regression specs freeze the clock: re-derive which baselines move). Add a Vitest case that a `Z` string and an offset-less string render differently so the contract is pinned.
6. **Tests:** the H2 `schema.sql` mirror, the integration tests that assert timestamps, a real-Postgres check (the migration applied to a copy of dev data; a post created from a UTC+7 browser shows "just now").

**Interim option, not filed on purpose:** a global Jackson setting that writes every `LocalDateTime` as a UTC instant (`...Z`) is one place and no migration, and the owner can ask for it if the 7-hour offset needs hiding before this ticket lands. It is a stop-gap: the columns would stay zone-less.

## Cross-cutting checks to run at pickup

- **API Change Discipline census** (every consumer of every changed DTO: the 22 API classes, `client/src`, `client/e2e/mocks`, the Go chat service, notification payloads), each marked compatible / updated / deferred with a filed ticket.
- **Release notes** (`SERVER.md`, and `CLIENT.md` if fixtures change behaviour): a database migration the owner must know about, and a rollback note (the type change is not trivially reversible once offsets are written).
- **Deployment guide:** the migration changes how the box's database is built: update `infra/documentation/PRODUCTION_DEPLOYMENT_GUIDE.md` and its history row.
- Account lifecycle: no new endpoint; nothing to add.
- Notification use case: none.

**Out of scope:** changing what the UI shows (relative-time wording, formats); any column that is already `timestamptz`; the scheduling time handling (`scheduledStart`, `viewerZoneId`), which is already correct.

**Tests:** Spock and integration tests for the changed mappers and queries; a Liquibase run on a scratch Postgres loaded with old-style rows (assert the converted instants); one Playwright case with the browser time zone set to `Asia/Ho_Chi_Minh` (the e2e suite otherwise runs in UTC and cannot see this class of bug).
