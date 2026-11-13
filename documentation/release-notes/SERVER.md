# server release notes

One section per released version, newest first. Write your lines under `## Unreleased` in the same PR as the change
(rules and format: [README.md](README.md)). `/release server` checks this block, turns it into the next version's section,
writes a fresh template and uses the section as the release PR description. Versions before this file existed only say so; the history is in git.

## Unreleased

### Changes
- Sessions carry `maleSlots`, `femaleSlots` (informational open slots per gender), `gameMood` (1-10, required on create) and `feeNote`, on the create and update requests and on `SessionResponse` (SESSION-46).
- A session title is required again (SESSION-49): creating a session without one, or updating it to a blank one, is `400 SESSION_TITLE_REQUIRED`; the title is trimmed. Group auto-generated sessions are titled after the group in the owner's stored language (en `<group>'s session`, vi `Trận đấu của nhóm <group>`, English when none).
- `GET /api/notifications` no longer fails for the whole page when a referenced session has no title (SESSION-49); a session without a title is just left out of the title lookup.
- `PREPARING` is a real draft (SESSION-46): a session starts `PREPARING` unless location, fee and duration are all set; every field except sport and group is editable while `PREPARING`; `PUT /api/sessions/{id}` on any other status is now 409 `SESSION_NOT_PREPARING` (before, only location and fee were locked); the automatic `PREPARING` to `SCHEDULED` flip is gone and the host leaves the draft with the new `POST /api/sessions/{id}/schedule` (400 `SESSION_NOT_READY` lists what is missing). New error codes `SESSION_GENDER_SLOTS_EXCEED_OPEN` and `SESSION_NOT_READY`.
- Game logging, backend (SESSION-50): `GET /api/sessions/{id}/records`, `POST /api/sessions/{id}/records/changes` (one change set: add, update, delete; at most 50 operations and 64 KB). Allowed while the session is `ONGOING` or `COMPLETED` and no later than 24 hours after `scheduledEndAt`; open to group members of a group session and `JOINED` participants of a standalone one. The server stores each record as sent; it checks only access, status and window, that the player ids the request names are `JOINED` (they are not stored), and the sport limits. A bad record does not fail the change set: it comes back in `results` with `status: REJECTED` and its `errorCode` (`_INVALID`, `_TOO_LARGE`, `_PLAYER_NOT_JOINED`, `_LIMIT_REACHED`) and the valid ones are stored; only a malformed request (a missing or repeated ref or id, over 50 operations) is a 400. Concurrent changes never error: the later request wins, an update of a deleted record restores it under a new id. New codes `SESSION_RECORD_NOT_ALLOWED`, `_NOT_LOGGABLE`, `_WINDOW_CLOSED`, `_INVALID`, `_PLAYER_NOT_JOINED`, `_LIMIT_REACHED`, `_TOO_LARGE`.
- Sport result schema (SESSION-50): `GET /api/sports/{id}/result-schema` (members), `GET /api/sports/all/{id}/result-schema` and `PUT /api/sports/{id}/result-schema` (admin). The schema tells the client what a recorded result is and carries `maxRecords` (default 100, at most 500). Each record is capped at 4 KB. A sport with no schema has no result logging; no schema is seeded, so an admin must `PUT` one for a sport before its sessions can record results. Invalid limits are `400 SPORT_RESULT_SCHEMA_INVALID`.

### Applied automatically
- `V088__sessions_title_not_null.sql` (SESSION-49) gives every existing session without a title the title `Session #<id>`, then makes `sessions.title` `NOT NULL`. It runs when the server starts and takes a short lock on `sessions`.
- `V085` (`male_slots`, `female_slots`, both with a `>= 0` check), `V086` (`game_mood INTEGER NOT NULL DEFAULT 5` with a 1-10 check; existing rows become 5) and `V087` (`fee_note VARCHAR(300)`) run when the server starts. Each only adds a column, so they are quick on the current table size.
- `V089__session_records.sql` (SESSION-50) adds the nullable `sports.result_schema` column and creates `session_records` (a new table, no existing data touched). It runs when the server starts and is quick.

### Manual actions on the box
- To switch game logging on for a sport, sign in as ADMIN and `PUT /api/sports/{sportId}/result-schema` for it (no schema is seeded). Badminton example and the fields: `modules/session/docs/SESSION_RECORDS_DESIGN.md`, section "Badminton result schema example". Without it the sport's sessions answer `409 SESSION_RECORD_NOT_LOGGABLE`.

### Rollback
- `V088` cannot be undone by Liquibase. After a rollback the column stays `NOT NULL`, so the previous server image fails to create a session that has no title (the old group auto-generation does exactly that): roll forward, or restore the pre-deploy dump (SESSION-49).
- Roll the server image back as usual; the three new columns stay and the previous release ignores them, so no restore is needed.
- A client older than CLIENT-SESSION-34 cannot complete a draft by filling in location and fee (the flip no longer happens) and gets 409 on edits to a `SCHEDULED` session. A new client against an old server has no Schedule endpoint. Roll the client back together with the server.
- `V089` only adds a column and one table; the previous server image ignores them, so roll the image back as usual and no restore is needed. Records already written stay in the tables and are not visible to the older server.

### Depends on
- Client: CLIENT-SESSION-34 (form, Schedule button and en/vi copy for the new error codes). Ship the server and the client together.
- Client: the SESSION-49 part (pre-filled, required title). An older client that lets the title be blank gets a `400 SESSION_TITLE_REQUIRED` it has no copy for.
- Client: CLIENT-GL-38 (the Result section and dialog, en/vi copy for the `SESSION_RECORD_*` codes) and SPORT-18 (admin screen; until it ships, the schema is set with the admin `PUT`). The endpoints work without the client. A client that ignores `results` would show a rejected record as saved, so the client must read each result's `status` after Save.

## 0.2.0 — 2026-11-09

### Changes
- Roles come from the Keycloak access token (`realm_access.roles`, only `USER` and `ADMIN`) instead of our `user_roles` table (A37). The sign-in, refresh and `GET /api/users/me` responses still return `roles`, now taken from the token. A user the token gives no `USER` gets 403 on authenticated endpoints; deactivation is unchanged (still refused within 60 s by the database gate, even with a valid `ADMIN` token).
- Provisioning no longer attaches a role to a new user (A37).
- The `roles` and `user_roles` tables, the `Role` entity and `UserService.getUserRoles` are removed (U27, migration `V084`). Nothing read the tables after A37; this release ships both together.

### Applied automatically
- `V084__drop_roles_and_user_roles.sql` drops `user_roles` and `roles` when the server starts (U27). It cannot be undone by Liquibase and a restore of a dump taken after it does not bring the tables back.
- The Redis entry `user:access-state:{id}` shrinks from `1|USER,ADMIN` to `1` or `0`; entries cached by the previous release are still read for their 60 s TTL, so nothing needs flushing (A37).

### Manual actions on the box
- Before this release is deployed: box `0.2.0` or later is installed (`sportconnect-setup`), `apply-realm-production.sh apply` and `check` have run (all lines `ok`; they read the secret files, so run `eval "$(bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh)"` first and `bash ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh --clean` after), and `ADMIN` is granted in the Keycloak console to every current admin (INFRA-25). Without that, every user gets 403 until their next token refresh and nobody can reach `/admin`.
- Before the deploy, on the box, with the old server still running (U27): export who holds ADMIN today and dump the two tables, because the migration drops them and the dump is the only way back:
  `docker exec sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_dev -c "select u.id, u.email from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where r.name = 'ADMIN'"` (keep the output; grant ADMIN in Keycloak to each of those people), then
  `docker exec sportconnect-dev-postgres-1 pg_dump -U postgres -d sportconnect_dev -t roles -t user_roles > roles-before-u27.sql` and keep the file off the box.
- After the deploy: sign in, open `/admin` as an admin (a refresh may be needed), and confirm a plain user is redirected.

### Rollback
- Going back is not a plain redeploy any more (U27). The previous server release (0.1.2) loads `user_roles` for every user, so against this release's database it fails on the first authenticated request. To go back: redeploy 0.1.2, then restore the two tables from `roles-before-u27.sql` (`docker exec -i sportconnect-dev-postgres-1 psql -U postgres -d sportconnect_dev < roles-before-u27.sql`, which recreates `roles` and `user_roles` with their rows; the dump has no data in any other table). A full database restore from the box backup also works and brings the tables back.
- The Keycloak roles are additive and need no undo.

### Depends on
- box >= 0.2.0

## 0.1.2 — 2026-11-02

### Changes

- Released before release notes existed; see `git log server-v0.1.1..server-v0.1.2`.

## 0.1.1 — 2026-11-01

### Changes

- Released before release notes existed; see `git log server-v0.1.0..server-v0.1.1`.

## 0.1.0 — 2026-10-28

### Changes

- Released before release notes existed; see `git log server-v0.1.0`.

