# SESSION-50 · Session result records: log, edit and delete games in a session (backend)

**Status:** `DONE` (2026-11-12)
**Type:** Feature · **Depends on:** none (design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`) ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The first slice of the BA's game logging (GL-1 to GL-7). Players of an ONGOING or COMPLETED session record results (badminton: two sides and the winning side). The result format is sport configuration; the server stores each record as it is and the client builds, validates and scores.

**Scope (full detail in the design doc):**
- New table `session_records` (one row per record: identity `id`, `session_id` (bigint, sessions use `Long` ids), `players` (jsonb list of user ids), opaque `data jsonb`, `client_request_id`, audit columns) and append-only `session_record_audit`; Liquibase `V089`, mirrored in the test `schema.sql`.
- `sports.result_schema` jsonb column (sport domain, additive), **not seeded**: the schema is set through the admin endpoints. `SportService.getResultSchema(sportId)` (active-only, empty means no result logging for that sport), a public `GET /api/sports/{sportId}/result-schema` (the client builds the UI from it), and the admin `GET /api/sports/all/{sportId}/result-schema` and `PUT /api/sports/{sportId}/result-schema`, mirroring the session attribute schema's endpoints. The server reads only `maxRecords` and `maxRecordBytes` from the schema.
- New `SessionRecordService` (session-api) and `SessionRecordController` at `/api/sessions/{sessionId}/records`: `GET` live records, `POST /changes` (one change set: add / update / delete, at most 50 operations, request body at most 64 KB), `GET /audit`.
- Concurrency: first come first served, no conflict errors, later request wins in every order. Add is a plain insert; delete is a hard delete with an audit snapshot; an update to a record that was deleted meanwhile is applied as an add with a new id (`RESTORED`).
- Server checks only: access (group session: active group member; standalone: `JOINED`), status `ONGOING`/`COMPLETED`, `now <= scheduledEndAt + 24h` (no admin override), `players` all `JOINED`, record count and byte limits, JSON object with a depth cap. Everything else is the client's (side sizes, no player on both sides, winner).
- Error codes (C12): `SESSION_RECORD_NOT_LOGGABLE`, `_WINDOW_CLOSED`, `_PLAYER_NOT_JOINED`, `_LIMIT_REACHED`, `_TOO_LARGE`, `_INVALID`, `_NOT_ALLOWED`; en/vi copy in the client ticket.

**Scope change (2026-11-12, owner, Phase 1 gate):** the migration does **not** seed `sports.result_schema`; instead this ticket adds the admin read and replace endpoints (backend only). The first-release schema is set through the admin `PUT`. The sport backlog's A26 (admin screen plus endpoints) is dropped, and its screen half is the client ticket SPORT-18.

**Deltas found at pickup (Phase 2, 2026-11-12):** `Session.id` and `SessionParticipant.id` are `Long`, so `session_id` is `bigint` and the paths take a `Long`. There is no array column mapping anywhere and the integration tests run on H2 only, so `players` is a jsonb list (same mapping as `Session.attributes`) and all SQL stays portable JPA; a GIN index or projection comes with the statistics ticket (SESSION-53). There is no request-size limit in the app, so a small filter on the records path enforces the 64 KB cap. A third gate, `SessionRecordGate`, is written because neither `SessionGate` nor `SessionDetailGate` matches the rule.

**Out of scope:** the admin screen for the result schema (SPORT-18, client backlog), guests, statistics, boards, seasons, adjustments (all filed below), the chat commands (SESSION-51), the client (CLIENT-GL-38).

**Tests:** Spock for limits, the players check, restore-as-add, idempotent replay and audit entries. `SessionRecordsIntegrationTest` in `server/src/test/java/com/sportconnect/integration/`: member vs non-member, `JOINED` vs `REQUESTED`/`INVITED`, wrong session status, window at +23h and +25h, limits, parallel change sets (distinct ids, no errors), delete vs update in both orders, atomic rejection of an invalid change set, error-code to HTTP mapping. Release-note lines under `## Unreleased` of `documentation/release-notes/SERVER.md`.

---

## Implementation summary (2026-11-12)

### Approved design (restated)
Backend only, all in the session module (no new Gradle module). One row per result record in `session_records` (identity id, never reused; `players` and `data` as jsonb; `client_request_id` unique per session), hard delete with an append-only `session_record_audit`. The server stores `data` as sent and checks only: access (group session: group member; standalone: `JOINED`), status `ONGOING`/`COMPLETED`, `now <= scheduledEndAt + 24h`, that every named player is `JOINED`, and limits (50 operations and 64 KB per request, `maxRecords`/`maxRecordBytes` from the sport's result schema, `data` nested at most 10 levels). Concurrency never errors: the later request wins, an update of a deleted record is stored again under a new id (`RESTORED`), deleting a gone record does nothing, delete wins inside one change set. The sport's result schema is a jsonb column set through admin endpoints (no seed). The client builds, validates and scores.

### What was built
- **Migration** `V089__session_records.sql` (registered in the master changelog, mirrored in `server/src/test/resources/schema.sql`): `sports.result_schema`, `session_records`, `session_record_audit`. Applied by hand to a scratch database on the dev Postgres (then dropped): tables, `jsonb` columns, the unique constraint and defaults behave as designed.
- **sport-api / sport-impl:** `Sport.resultSchema`; `SportService.getResultSchema` (active-only), `getResultSchemaForAdmin`, `replaceResultSchema` (validates only what the server reads: object, 16 KB, `maxRecords` 1-500, `maxRecordBytes` 1-8192, else `400 SPORT_RESULT_SCHEMA_INVALID`); `GET /api/sports/{id}/result-schema`, `GET /api/sports/all/{id}/result-schema`, `PUT /api/sports/{id}/result-schema` in `SportController`.
- **session-api:** `SessionRecordService` and the DTOs (`RecordChangeSetRequest`, `RecordAddOperation`, `RecordUpdateOperation`, `RecordChangeSetResponse`, `RecordOperationResult`, `RecordOperationStatus`, `SessionRecordDto`, `RecordAuditDto`).
- **session-impl** (`com.sportconnect.session.record`): `SessionRecord`, `SessionRecordAudit`, their repositories (row locks `PESSIMISTIC_WRITE` ordered by id; batch lookups), `SessionRecordGate` (a third gate: neither `SessionGate` nor `SessionDetailGate` matches the rule), `SessionRecordServiceImpl`, `SessionRecordController` (`GET`, `POST /changes`, `GET /audit`), `RecordRequestSizeFilter`; plus `SessionParticipantRepository.findBySessionIdAndStatusAndUserIdIn` (one query for every named player).
- **Docs:** the `SESSION_RECORD_*` and `SPORT_RESULT_SCHEMA_INVALID` rows in `documentation/md/ERROR_CODES.md`; `## Unreleased` lines in `documentation/release-notes/SERVER.md` (including the manual action: an admin must `PUT` a schema per sport); a badminton schema example in `SESSION_RECORDS_DESIGN.md`; the implementation log in `BA_GAME_LOGGING_DELTA.md`.
- **Account lifecycle:** no extra `isActive` call. `JwtAuthenticationFilter` (auth-impl, line 105) refuses a deactivated or unprovisioned caller on every authenticated path; confirmed against the source at pickup.
- **N+1:** none. Players, locks, retries and counts are batch queries; the loops only read maps.
- **Consumer census:** additive only (new endpoints, a new nullable column, new tables, new methods). The only implementer of `SportService` is `SportServiceImpl`; no client code, MSW handler or test refers to a result schema or a record endpoint. The client consumers are filed (CLIENT-GL-38, SPORT-18).

### Divergences from the approved plan
- **Scope change at the Phase 1 gate (owner):** the schema is not seeded; this ticket adds the admin endpoints instead. The sport backlog's A26 was dropped and its screen half filed as client SPORT-18.
- **Phase 2 deltas:** session ids are `Long`, so `session_id` is `bigint`; `players` is jsonb, not `uuid[]` (no array mapping in the codebase, integration tests run on H2).
- `RecordOperationResult` carries `requestedId` beside `id`, so a restore (new id) can be matched to the update that asked for it. An update superseded by a delete in the same change set reports `UNCHANGED`.
- The test clock is a replaceable field on the service, not a constructor dependency (the app has no `Clock` bean).
- A bug found by the Spock suite and fixed: the nesting check counted a scalar leaf as a level, so data of exactly 10 levels was refused.

### Verification
- Scoped: `:modules:session:session-impl:test` and `:modules:sport:sport-impl:test` green (36 new Spock tests in `SessionRecordServiceImplSpec` and `SportResultSchemaSpec`). New integration tests: `SessionRecordsIntegrationTest` (25) and `SportResultSchemaIntegrationTest` (9). **`:server:test` full: 749 tests, 0 failures, 0 errors, 0 skipped.**
- **IT changes (added):** `server/src/test/java/com/sportconnect/integration/SessionRecordsIntegrationTest.java`: access (standalone `JOINED` can add and read; group member who never joined can log but cannot be named; outsider, `REQUESTED` and non-member forbidden; missing session and deleted group 404), status and window (PREPARING/SCHEDULED/CANCELLED refused; +23h accepted, +25h refused for add and delete; reads stay open), sport with no schema, record limit, byte limit, 64 KB body cap (413), atomic rejection with nothing stored, add/update/delete/restore lifecycle with the four audit actions, update/delete in both orders, delete wins inside one change set, retry by `clientRef` creates no duplicate, mixed change set, 8 parallel change sets (distinct ids, all 200), parallel update vs delete (no error, consistent end state). `server/src/test/java/com/sportconnect/integration/SportResultSchemaIntegrationTest.java`: admin gate (403, 401), admin put and read back, member read (null and set), inactive sport 404, out-of-range limits 400, unknown sport 404, empty body clears. Mirror tables added to `schema.sql`.
- **Requirement mutations killed (8 of 8):** window 24h to 48h; `JOINED` check removed; delete-wins removed; status check removed; standalone gate admitting `REQUESTED`; retry replay removed; record limit check removed; sport schema limit validation removed. Each run was a scoped integration class; the originals were restored and re-checked.
- **Not run:** `./gradlew :server:bootRun` (the migration was applied to a scratch Postgres database instead, so the live app has not started with `V089`). The parallel tests run on H2, so they prove the portable JPA logic, not PostgreSQL's row-lock behaviour. A body over 64 KB sent chunked (no `Content-Length`) is cut off by the counting stream and should end as a generic 400; that path is not covered by a test.
- **Known gap:** two identical requests (same `clientRef`) arriving at the very same instant can make the second fail on the unique constraint (a server error); a retry after the first finished is safe. Recorded in the BA delta log.
- **Client:** no client change in this ticket's diff (docs only under `client/docs/`), so no e2e or visual-regression impact and no `BASELINE-UPDATE` row.

---

## Decision change (2026-11-13, owner): no audit table, no stored player ids

The owner asked to keep the database small. Two things from the first implementation were removed before merge:

- **`session_record_audit`, `GET /audit`, `RecordAuditDto` and the audit writes are gone.** A deleted or replaced record leaves no trace; deleting is final. The response statuses (`CREATED`, `UPDATED`, `RESTORED`, `DELETED`, `UNCHANGED`) are unchanged: they come from the change-set logic, not from the audit. SESSION-57 (audit retention and rate limiting) was dropped with it.
- **`session_records.players` is gone.** The request now carries `playerIds` beside `data` (add and update). The server checks that every id is `JOINED` and does not store it; the client reads players, sides, winner and scores from `data` and validates `data` against the sport's result schema when it loads. A wrong `data` can be stored, but the board skips it because the client's validation fails. The response record no longer has a `players` field.
- Table now: `id, session_id, data, client_request_id, created_by, created_at, updated_by, updated_at`. `V089` was edited in place (never merged or applied outside a scratch database).
- Verified: the Spock spec and `SessionRecordsIntegrationTest` / `SportResultSchemaIntegrationTest` pass after the change (not a full `:server:test` rerun yet).
- Where the text above (summary, design, tests list) still names the audit table, `GET /audit`, `RecordAuditDto` or a stored `players` column, this note overrides it.

## Decision change (2026-11-13, owner): fixed 4 KB per record, count limit counted with stored records

- **Per-record size:** a record's serialized `data` is capped at a fixed **4096 bytes**, the same check as sport profile attributes and session attributes. `maxRecordBytes` is gone from the result schema (the server no longer reads it, and the admin `PUT` no longer validates it); over the cap is `400 SESSION_RECORD_TOO_LARGE` with `maxBytes: 4096`. Where older text says "sport's `maxRecordBytes` (default 2048, ceiling 8192)", this overrides it. The 64 KB request cap stays as the guard on the whole change set.
- **Record count:** the sport's `maxRecords` (default 100, ceiling 500) is compared with the records **already stored in the session** plus the adds, minus the deletes in the same change set. With 100 configured for badminton, the 101st record is refused with `400 SESSION_RECORD_LIMIT_REACHED` and `errorParams.maxRecords`, and the whole change set is rolled back (nothing stored). (A burst of simultaneous adds may overshoot slightly; the check is not serialised across requests.)
- New tests: `SessionRecordsIntegrationTest` (a record over 4 KB; the 3rd record with `maxRecords` 2 counting the two stored ones) and Spock cases for the fixed cap.

## Decision change (2026-11-13, owner): a bad record no longer fails the change set

- Each record is checked on its own. An invalid record (`playerIds` or `data` malformed), one over 4 KB, one naming a player who has not `JOINED`, or an add past `maxRecords` becomes a result with `status: REJECTED`, `errorCode` and `errorParams`; the response is still `200`, every valid operation is applied, and `records` is the list after the valid ones. Where older text says these reject the whole change set (or answer 400 / roll back), this overrides it.
- Still refused whole (400 `SESSION_RECORD_INVALID`): a malformed request (an add without its own `clientRef`, an update or delete without an id or with a repeated one, over 50 operations), and the access, status and window checks (403 / 404 / 409), the 64 KB body (413).
- `maxRecords`: only as many new records as still fit (counting the stored ones, minus deletes in the same change set) are stored, in request order, adds before restores; the rest are `REJECTED` with `SESSION_RECORD_LIMIT_REACHED`. A rejected update stores nothing and leaves the existing record as it was. A rejected restore does not recreate the record.
- Client: read `results` after every Save; keep rejected rows in the dialog and show the code's en/vi copy beside each (CLIENT-GL-38).
