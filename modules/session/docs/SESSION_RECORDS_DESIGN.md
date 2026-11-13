# Session results (game logging) — design

**Status:** Approved plan, not implemented (2026-11-12). **Tickets:** SESSION-50 (backend), CLIENT-SESSION-38 (client); follow-ups SESSION-51..60, CLIENT-SESSION-39..48, SPORT-18 (client backlog).
**Source:** `/feature` session "game logging", BA document `D:Planningusiness-analystRequirements - Games, Statistics and Leaderboards.md`. Written plan-first: where the plan says "filed as a follow-up", the ticket ids above are the real entries.

## Context
BA doc `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`: the founding badminton group wants to log games in SportConnect instead of a Discord bot + Google Sheet. SportConnect is multi-sport, so the design is **sport-configured**: a sport's *result schema* tells the **client** what one recorded result is and how to build, validate and score it (badminton/pickleball: a `MATCH` between two sides; running/swimming later: a per-player `RECORD`). ST (stats) will later be defined from the same schema fields.

Decisions: slice = logging only (no stats/boards/seasons/adjustments, **no guests**); "attended" = `JOINED` participant; logging only in `ONGOING`/`COMPLETED` sessions; **server stores the payload as-is** (no schema validation) with limits; **client validates and computes the scoreboard**; chat commands `:add :del :upd` are a **follow-up ticket**; concurrency is **first come first served, no conflict errors, later request wins in every order**; one row per record with a unique never-reused id, **hard delete + audit snapshot**; no smallest-free-slot rule, no write combiner; lives in the **session module**.

Verified: a session can't be scheduled without `scheduledEndAt` (`SessionServiceImpl.missingForScheduling`), so ONGOING/COMPLETED sessions always have an end. Add/edit/delete window closes at `scheduledEndAt + 24h`.

## Storage and concurrency design
Rejected: a JSON blob per session (whole-blob read-modify-write serializes writers and loses concurrent changes, hot row shared with `updateSession`). Rejected: smallest-free-slot ids (race on allocation, retry/combiner, stale edit could hit a reused slot). Rejected: soft delete (a per-session record limit plus restore-as-add makes tombstones unnecessary; hard delete keeps the table bounded by live rows).

`session_records(id bigint generated always as identity PRIMARY KEY, session_id bigint NOT NULL, players jsonb NOT NULL, data jsonb NOT NULL, client_request_id uuid NOT NULL, created_by uuid NOT NULL, created_at, updated_by, updated_at)`; index `(session_id, id)`; unique `(session_id, client_request_id)`. `players` (a jsonb list of user ids, not `uuid[]`: no array mapping exists in the codebase and the integration tests run on H2) is the client's `players` list stored beside the opaque `data` so the server can check it without parsing `data`. No GIN index now (only needed for the later per-player ST queries; added in that ticket). Session ids are `Long` in this codebase, hence the `bigint`.

- **Add:** plain `INSERT`; the sequence gives distinct ids, so concurrent adds never conflict, block or retry. `client_request_id` is the client's `clientRef`, so a retried request never duplicates a record.
- **Update:** lock/read the one row (`SELECT ... FOR UPDATE WHERE id AND session_id` for the audit before-image), then `UPDATE`. **If the row no longer exists (deleted meanwhile), the update is applied as an add with a new id, reported `RESTORED`** (later request wins; ids are never re-inserted, so a client can't plant an id the sequence will later hit).
- **Delete:** `DELETE ... WHERE id AND session_id RETURNING data, player_ids`; idempotent (already gone ⇒ no-op success). Delete after update ⇒ gone; update after delete ⇒ restored as a new record. Within a single change set, if the same id is both updated and deleted, delete wins (the dialog never sends both).
- Every write touches one row, so bursts of players never contend. No in-memory queue or combiner.
- **Limits:** per-session live record count ≤ the sport's `maxRecords` (default 100 if unset, hard ceiling 500), checked in the same transaction on add/restore (a burst of simultaneous adds may overshoot slightly; this is an abuse guard, not a strict invariant). `data` serialized size ≤ a fixed 4096 bytes (same as sport profile and session attributes); `player_ids` non-empty, distinct, ≤ 50.
- **Abuse protection (size):** the change-set request body is capped at 64 KB, enforced at the HTTP layer before deep parsing, with ≤50 operations; `data` byte size is measured as UTF-8 and rejected with `SESSION_RECORD_TOO_LARGE`; JSON nesting depth is capped (e.g. 10) on the record parser (tight `StreamReadConstraints`) so deeply nested payloads can't be used against the parser. Live data per session is bounded by `maxRecords` × 4 KB. Audit rows are append-only and could grow under add/delete spam within the limits: filed as a follow-up (audit retention / rate limiting), not solved here.
- **Audit:** append-only `session_record_audit(id bigserial, session_id, record_id, action CREATED|UPDATED|DELETED|RESTORED, actor_id, before jsonb, after jsonb, at)` in the same transaction (the before-image of a delete comes from `RETURNING`). Since records are hard-deleted, audit is the history; it is also what group members/participants can read (NF-5).
- **Display number:** UI shows #1, #2, ... by creation order, computed client-side (cosmetic; shifts after a delete). A stable per-session number for chat commands is decided in that follow-up ticket.
- **Scoreboard:** computed **on the client** from the record list using the sport schema's points rule. Cross-session stats later are computed server-side from stored rows (ST-5), reading schema fields tolerantly (a malformed record is skipped, not fatal).

## Server-side checks (and what is deliberately NOT checked)
Checked: access gate, session availability/status/24h window, `players` are all `JOINED` participants of the session (protects other users' future career stats and head-to-head from fabricated records), limits above, `data` is a JSON object.
Not checked (client owns it, per the sport schema): side sizes, no player on both sides (GL-4), winner value, points, labels, any field shape. A buggy client can store a malformed `data`; it only affects that session, and ST reads it tolerantly.

## Backend (all in `modules/session`)
No new Gradle module. `session-impl` already depends on `group-api` and `sport-api`; it reads its own `Session`/`SessionParticipant` data directly. Chat commands later live in the same module (no dependency cycle).

- **session-api:** new `SessionRecordService` interface (separate from the large `SessionService`) + DTOs (`RecordChangeSetRequest`, `RecordChangeSetResponse`, `SessionRecordDto`, audit DTO).
- **session-impl:** package `com.sportconnect.session.record` — entities `SessionRecord`, `SessionRecordAudit`, repositories, `SessionRecordServiceImpl`, `SessionRecordController`, a `ResourceGate<Session>` implementation (or reuse `SessionGate` if its rules match exactly; decide at implementation after reading it).
- **Sport domain (additive):** jsonb column `sports.result_schema` (like `session_attributes_schema`), **not seeded**; it is set through admin endpoints added in SESSION-50 (`GET /api/sports/all/{sportId}/result-schema`, `PUT /api/sports/{sportId}/result-schema`) and read by the client through a public `GET /api/sports/{sportId}/result-schema`. It is mainly **client-facing**: `kind: MATCH`, players per side min/max (1..2), record mode `WINNER_ONLY`, points win/loss (+1/-1), labels en/vi. The server reads only `maxRecords` from it (and treats "has a result schema" as "logging enabled for this sport"). New `SportService.getResultSchema(sportId)` (active-only, `Optional`). The admin screen is the client ticket SPORT-18.
- **Liquibase:** `V089__session_records.sql` (two tables + `sports.result_schema`, no seed), registered in `db.changelog-master.xml`; mirrored in `server/src/test/resources/schema.sql` (`BIGSERIAL`, `JSON`; the integration tests run on H2 only, so server SQL stays portable JPA).

**API (`/api/sessions/{sessionId}/records`, `@PreAuthorize("hasRole('USER')")`, `ApiResponse<T>`):**
- `GET` live records (`id`, `players`, `data`, timestamps, `createdBy`). No scoreboard.
- `POST /changes` — one **change set** per dialog Save: `{ add: [{clientRef, players, data}], update: [{id, players, data}], delete: [id] }`. One transaction: multi-row insert, updates, deletes, audit rows. Cap ≤50 operations per request.
  - **Validation errors** (own input: player not JOINED, too large, limit reached, not an object, window closed, not allowed) reject the whole change set with a coded error naming the offending item (`clientRef` or `id`).
  - **Concurrency never errors:** deleting an already-deleted record is a no-op success; updating a deleted record restores it as a new record.
  - **Response:** per-operation statuses (`CREATED|UPDATED|RESTORED|DELETED|UNCHANGED`) with `{clientRef|id → id}` mapping, and the fresh full record list so the client reconciles with other players' changes.
- `GET /audit`.
- No per-item POST/PUT/DELETE: chat commands later submit a one-item change set to the same service.

**Rules (service layer):**
1. Available: session exists and its group (if any) is active, else `NotFound`.
2. Visible/allowed: group session ⇒ `GroupService.isGroupMember`; standalone ⇒ caller is `JOINED`. Else `Forbidden`.
3. Add/update/delete only while status is `ONGOING`/`COMPLETED` and `now <= scheduledEndAt + 24h`; no admin override. (Adding after the window is refused: assumption.)
4. Players/limits as above.
5. Deactivated callers are already refused by `JwtAuthenticationFilter` (`getAccessState`) on every authenticated path; no extra call, per CLAUDE.md.
Error codes (C12): `SESSION_RECORD_NOT_LOGGABLE`, `SESSION_RECORD_WINDOW_CLOSED`, `SESSION_RECORD_PLAYER_NOT_JOINED`, `SESSION_RECORD_LIMIT_REACHED`, `SESSION_RECORD_TOO_LARGE`, `SESSION_RECORD_INVALID`, `SESSION_RECORD_NOT_ALLOWED`; en/vi client copy in the same change. The client's own validation messages (side sizes, GL-4, ...) are client-only en/vi strings.

## Frontend (`client/src/features/session/`)
In the session detail modal, under Players: a **collapsible "Result / Kết quả" section, collapsed by default**, shown only for ONGOING/COMPLETED sessions whose sport has a result schema. Contents: **client-computed scoreboard** (games, wins, losses, net points from the schema's points rule), record list (display #, sides, winner), header **Update** button opening a nested dialog to add / edit / delete (pick players per side from JOINED participants, tap the winning side, at most 3 taps once players are chosen). The UI is built from the sport's result schema; **the client validates the record list** (side sizes, no player on both sides, winner set, `maxRecords`, size) before Save. Disabled state after the 24h window. Labels come from the schema (en/vi).
**The dialog is a draft:** it loads a snapshot, keeps each existing row's DB `id` hidden in state (the #1, #2, #3 shown are display positions only), gives new rows a temporary client UUID (`clientRef`), and on Save sends only the diff against the snapshot (added, changed, deleted rows; untouched rows are never sent, so they can't clobber others' concurrent edits) as one change set. On success it replaces its state with the response's fresh list.
Hooks, `queryKeys.ts`, hand-mirrored types, en + vi strings including error codes, MSW handlers in `client/e2e/mocks`; mobile-first one-handed layout.

## Cross-cutting and tickets
- Docs: `modules/session/docs/SESSION_RECORDS_DESIGN.md` (include the rejected alternatives and the "server doesn't validate the schema, except players and limits" decision with its trade-off), summary in `PROGRESS.md`; backend ticket SESSION-50 and a client ticket (CLIENT-SESSION-N) in the session and client backlogs (thin index + `MVP/` detail file); `## Unreleased` lines in `documentation/release-notes/SERVER.md` and `CLIENT.md`.
- Follow-up tickets to file as real backlog entries: chat commands `:add :del :upd` (grammar, player mentions, parse location, stable per-session number, reply), guests, ST (stats/head-to-head/pair, server-side from schema fields), GIN index on `player_ids`, audit retention / rate limiting, boards + ranking config, seasons/KPI/recap, adjustments, shortcuts (GL-8), offline queue (GL-9), duplicate warning, sharing cards, CSV export, RECORD kind (running/swimming), template admin screen, draws/best-of-three.
- `documentation/md/NOTIFICATION_USE_CASES.md`: add "notify participants when a result is added/edited/deleted?" (unresolved).
- Census: only additive changes to `SportService` and `sports` (new nullable column); no existing contract altered. No new Redis keys or ports.

## Not changing
Session lifecycle/job, participant statuses, group roles, existing endpoints, security path list.

## Verification
- Spock: limits (count, bytes, players), players-JOINED check, restore-as-add, idempotent replay by `clientRef`, audit entries incl. `RESTORED`.
- IT in `server/src/test/java/com/sportconnect/integration/` (`SessionRecordsIntegrationTest`): group member vs non-member, JOINED vs REQUESTED/INVITED standalone, non-JOINED player rejected, PREPARING/SCHEDULED refused, window at +23h ok / +25h refused, limit reached, oversized payload; **concurrency**: N parallel change sets all succeed with distinct ids and no errors; parallel delete vs update ends deleted-or-restored with no errors; a replayed `clientRef` creates no duplicate; a change set with one invalid item changes nothing (atomic) and names the item; mixed add/update/delete in one request; two sessions written at once don't interfere; real write path and error-code→HTTP mapping.
- Client: Vitest for the section, dialog, diff logic, schema-driven validation and scoreboard math; scoped Playwright flow with MSW; check vi/en. Scoped tests only.
- Manual: run server + client, add a 1v2 game in an ONGOING session, delete one, add two, confirm client scoreboard, display numbering and audit.

## Deltas at pickup (2026-11-12)

Ids are `Long`; `players` is jsonb; no seed, admin endpoints in SESSION-50 (scope change at the Phase 1 gate); a request-size filter and `SessionRecordGate` are new code. See `modules/session/docs/MVP/SESSION-50_SESSION_RECORDS_LOG_EDIT_DELETE_GAMES.md`.

## Badminton result schema example

Set with `PUT /api/sports/{sportId}/result-schema` (ADMIN). The server reads only `maxRecords`; every other field is the client contract that CLIENT-SESSION-38 finalizes, so treat the rest as the starting shape:

```json
{
  "kind": "MATCH",
  "playersPerSide": { "min": 1, "max": 2 },
  "recordMode": "WINNER_ONLY",
  "points": { "win": 1, "loss": -1 },
  "labels": { "en": "Game", "vi": "Trận" },
  "maxRecords": 100,
}
```

A record sent by the client for this schema looks like `{"clientRef": "<uuid>", "players": ["<userId>", ...], "data": {"sideOne": ["<userId>"], "sideTwo": ["<userId>", "<userId>"], "winningSide": 1}}`; the server stores `data` as it is.

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
- Client: read `results` after every Save; keep rejected rows in the dialog and show the code's en/vi copy beside each (CLIENT-SESSION-38).
