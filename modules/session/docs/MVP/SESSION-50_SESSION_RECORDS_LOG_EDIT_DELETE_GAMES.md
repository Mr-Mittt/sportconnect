# SESSION-50 · Session result records: log, edit and delete games in a session (backend)

**Status:** `TODO`
**Type:** Feature · **Depends on:** none (design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`) ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

The first slice of the BA's game logging (GL-1 to GL-7). Players of an ONGOING or COMPLETED session record results (badminton: two sides and the winning side). The result format is sport configuration; the server stores each record as it is and the client builds, validates and scores.

**Scope (full detail in the design doc):**
- New table `session_records` (one row per record: identity `id`, `session_id`, `player_ids uuid[]`, opaque `data jsonb`, `client_request_id`, audit columns) and append-only `session_record_audit`; Liquibase `V089`, mirrored in the test `schema.sql`.
- `sports.result_schema` jsonb column (sport domain, additive), seeded for badminton (pickleball if its sport row exists), and `SportService.getResultSchema(sportId)`. The server reads only `maxRecords` and `maxRecordBytes` from it; no schema means no result logging for that sport.
- New `SessionRecordService` (session-api) and `SessionRecordController` at `/api/sessions/{sessionId}/records`: `GET` live records, `POST /changes` (one change set: add / update / delete, at most 50 operations, request body at most 64 KB), `GET /audit`.
- Concurrency: first come first served, no conflict errors, later request wins in every order. Add is a plain insert; delete is a hard delete with an audit snapshot; an update to a record that was deleted meanwhile is applied as an add with a new id (`RESTORED`).
- Server checks only: access (group session: active group member; standalone: `JOINED`), status `ONGOING`/`COMPLETED`, `now <= scheduledEndAt + 24h` (no admin override), `players` all `JOINED`, record count and byte limits, JSON object with a depth cap. Everything else is the client's (side sizes, no player on both sides, winner).
- Error codes (C12): `SESSION_RECORD_NOT_LOGGABLE`, `_WINDOW_CLOSED`, `_PLAYER_NOT_JOINED`, `_LIMIT_REACHED`, `_TOO_LARGE`, `_INVALID`, `_NOT_ALLOWED`; en/vi copy in the client ticket.

**Out of scope:** Guests, statistics, boards, seasons, adjustments (all filed below), the chat commands (SESSION-51), the client (CLIENT-SESSION-38).

**Tests:** Spock for limits, the players check, restore-as-add, idempotent replay and audit entries. `SessionRecordsIntegrationTest` in `server/src/test/java/com/sportconnect/integration/`: member vs non-member, `JOINED` vs `REQUESTED`/`INVITED`, wrong session status, window at +23h and +25h, limits, parallel change sets (distinct ids, no errors), delete vs update in both orders, atomic rejection of an invalid change set, error-code to HTTP mapping. Release-note lines under `## Unreleased` of `documentation/release-notes/SERVER.md`.
