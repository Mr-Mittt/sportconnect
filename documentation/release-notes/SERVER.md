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
- People search for the session thread (SESSION-GL-64): `GET /api/sessions/{id}/thread-people?q=&size=` returns the people who can see the thread (`JOINED`, `REQUESTED` and `INVITED` participants, then, for a group session, the group's other members) as `userId`, `fullName`, `avatarUrl`; same access as the thread (404 `SESSION_NOT_FOUND`, 403 `SESSION_FORBIDDEN`). `size` defaults to 5 and is cut to 20. No new error code.
- One name search for the whole app (SESSION-GL-64): a user is found by first and last name only, from the start of a name or of a later word of it, ignoring case and accents ("tuan" finds "Tuấn", "dang" finds "Đặng"); every typed word must match. `GET /api/users/search` follows the same rule, so it **no longer matches the username and no longer matches the middle of a word**; its response shape is unchanged. A user with neither a first nor a last name is not found by name.
- Group member search for tagging (B23): `GET /api/groups/{groupId}/members/search?q=&size=` returns the group's members whose first or last name matches (the same rule as `thread-people`: word-start, ignoring case and accents, every typed word must match) as `userId`, `fullName`, `avatarUrl`. Members only, any role: 404 `GROUP_NOT_FOUND` for a missing or deleted group, 403 `GROUP_MEMBER_REQUIRED` for anyone else, public or private. `size` defaults to 5 and is cut to 20. The caller can appear; a deactivated member never does. No new error code, no migration.
- Result changes tell the session (SESSION-GL-63): a records change set that saved at least one operation writes one system comment in the session thread ("{name} has updated the result") and notifies every `JOINED`, `REQUESTED` and `INVITED` participant except the actor (new routing key `session.record.changed`; unread ones fold into one notification per session, so a busy session does not flood anyone). A change set where nothing was saved writes neither.
- System entries carry a code (SESSION-GL-63): `CommentResponse` and `PostResponse` gain `systemCode` and `systemParams` (both null for a user's comment or post and for every entry written before this release); codes `SESSION_JOINED`, `SESSION_LEFT`, `SESSION_STARTED`, `SESSION_RECORDS_UPDATED` (session thread) and `GROUP_MEMBER_JOINED`, `GROUP_MEMBER_JOINED_INVITED` (the group welcome post). `content` still carries the English text, so a client that does not read the code shows what it showed before. Old entries are not backfilled.
- Sport result schema (SESSION-50): `GET /api/sports/{id}/result-schema` (members), `GET /api/sports/all/{id}/result-schema` and `PUT /api/sports/{id}/result-schema` (admin). The schema tells the client what a recorded result is and carries `maxRecords` (default 100, at most 500). Each record is capped at 4 KB. A sport with no schema has no result logging; no schema is seeded, so an admin must `PUT` one for a sport before its sessions can record results. Invalid limits are `400 SPORT_RESULT_SCHEMA_INVALID`.
- A joined participant can leave a session only until 15 minutes before it starts (SESSION-65): `DELETE /api/sessions/{id}/leave` is `409 SESSION_LEAVE_TOO_LATE` (with `errorParams.cutoffAt`) after that, in every session status (a cancelled one included) and for group sessions, and changes nothing. Declining an invitation and cancelling a join request are unaffected.
- A notification can carry a short text (NTF-8): `NotificationResponse` gains a nullable `message` (at most 500 characters). A `session.join_request.rejected` notification carries the host's reason for declining (it used to be dropped); a blank reason is no message, and a later rejection of the same session that merges into the unread notification replaces the text, or clears it when it has none. Every other notification type has `message: null`.
- Delete the read notifications (NTF-8): `DELETE /api/notifications/read` hard-deletes every read notification of the caller in one call and returns how many it removed (`0` when there is nothing read, so a repeat call is harmless). Unread notifications and other users' notifications are never touched, the unread count does not change, and there is no soft delete: a deleted notification is gone. There is no error code of its own (it only acts on the caller's own rows).
- A host edit of a `PREPARING` session tells the discussion thread what changed (SESSION-67): `PUT /api/sessions/{id}` writes one system comment per field whose value really changed (title, location, location note, start, duration, capacity, fee, fee note, auto approval, initial slots, male and female slots, game mood, and one comment without values for the sport attributes), in the same transaction, each with a `systemCode` (`SESSION_TITLE_CHANGED`, `SESSION_LOCATION_CHANGED`, ... `SESSION_ATTRIBUTES_CHANGED`) and string params `name` (the editor), `old` and `new` (empty = no value; the fee carries `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd`). A request that re-sends the stored values writes nothing. The English `content` stays as the fallback. The comments are authored by the session's creator and do not send a comment notification; the existing `session.details.updated` notification is unchanged. No new endpoint, no error code, no migration.
- Share a session with friends (SESSION-66): `POST /api/sessions/{id}/shares` with `{ "userIds": [...] }` (1 to 50). A `JOINED` participant of a standalone `PREPARING` or `SCHEDULED` session notifies friends: each gets the existing "invited you to join" notification (`session.invitation.created`, the sharer as actor). It is a share, not an invitation: no participant row is written, so the friend asks to join under the normal rules (host approval unless auto-approve). The answer is `{ sent, skipped }`; anyone who is not a friend (silently: no error, never notified), the caller's own id, repeated ids, friends already `JOINED`, `REQUESTED` or `INVITED`, and deactivated friends are skipped, all in `skipped`. Refusals: `403 SESSION_SHARE_NOT_ALLOWED` (not a joined participant, or a group session), `409 SESSION_NOT_SHAREABLE` (`errorParams.status`), `404 SESSION_NOT_FOUND`. No migration, nothing on the box to change.

### Applied automatically
- `V088__sessions_title_not_null.sql` (SESSION-49) gives every existing session without a title the title `Session #<id>`, then makes `sessions.title` `NOT NULL`. It runs when the server starts and takes a short lock on `sessions`.
- `V085` (`male_slots`, `female_slots`, both with a `>= 0` check), `V086` (`game_mood INTEGER NOT NULL DEFAULT 5` with a 1-10 check; existing rows become 5) and `V087` (`fee_note VARCHAR(300)`) run when the server starts. Each only adds a column, so they are quick on the current table size.
- `V089__session_records.sql` (SESSION-50) adds the nullable `sports.result_schema` column and creates `session_records` (a new table, no existing data touched). It runs when the server starts and is quick.
- `V090__users_name_search_unaccent_trigram.sql` (SESSION-GL-64) creates the `unaccent` and `pg_trgm` extensions, the function `immutable_unaccent(text)` and two GIN indexes on `users` (first and last name). It runs when the server starts; building the two indexes takes a short write lock on `users` (a moment at the current size).
- `V091__system_entry_code_and_params.sql` (SESSION-GL-63) adds the nullable `system_code` and `system_params` columns to `comments` and `posts`. Only columns are added (no data rewritten, no index), so it is quick; it runs when the server starts.
- SESSION-65: nothing (no migration, no setting; the 15 minutes is a constant).
- `V092__notifications_message.sql` (NTF-8) adds the nullable `notifications.message VARCHAR(500)` column. Only a column is added (no data rewritten, no default, no index); it runs when the server starts and takes a moment on any table size.
- SESSION-67: nothing (no migration, no setting).

### Manual actions on the box
- To switch game logging on for a sport, sign in as ADMIN and `PUT /api/sports/{sportId}/result-schema` for it (no schema is seeded). Badminton example and the fields: `modules/session/docs/SESSION_RECORDS_DESIGN.md`, section "Badminton result schema example". Without it the sport's sessions answer `409 SESSION_RECORD_NOT_LOGGABLE`.
- B23: none.
- SESSION-GL-63: none.
- SESSION-GL-64: none expected. `V090` creates two trusted extensions as the app role (the database owner), and the production Postgres image (`postgres:16` plus PostGIS) ships both. If the server fails to start with `permission denied to create extension`, run `CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;` once in the server database as the `postgres` superuser, then restart the server.
- SESSION-65: none.
- NTF-8: none.
- SESSION-67: none.

### Rollback
- `V088` cannot be undone by Liquibase. After a rollback the column stays `NOT NULL`, so the previous server image fails to create a session that has no title (the old group auto-generation does exactly that): roll forward, or restore the pre-deploy dump (SESSION-49).
- Roll the server image back as usual; the three new columns stay and the previous release ignores them, so no restore is needed.
- A client older than CLIENT-SESSION-34 cannot complete a draft by filling in location and fee (the flip no longer happens) and gets 409 on edits to a `SCHEDULED` session. A new client against an old server has no Schedule endpoint. Roll the client back together with the server.
- `V089` only adds a column and one table; the previous server image ignores them, so roll the image back as usual and no restore is needed. Records already written stay in the tables and are not visible to the older server.
- B23 adds one read endpoint and no data; the previous server image simply does not have it (a client that calls it would get 404, and CLIENT-GL-50 part 2 is not shipped yet), so roll the image back as usual.
- `V090` only adds extensions, a function and two indexes; the previous server image ignores them, so roll the image back as usual and no restore is needed. (The previous release's user search matches the middle of a word and the username again.)
- `V091` only adds two nullable columns to each of two tables; the previous server image ignores them, so roll the image back as usual and no restore is needed. Entries written meanwhile keep their code and show their English text on the older server.
- SESSION-65 adds one refusal and no data; roll the server image back as usual. The previous server lets a joined participant leave at any time again, while a newer client keeps hiding the button after the cutoff.
- NTF-8: roll the server image back as usual; the previous server ignores the new nullable column, which can stay. The delete cannot be undone: read notifications removed by `DELETE /api/notifications/read` do not come back with a rollback.
- SESSION-67 adds comment rows and no schema; roll the server image back as usual. The comments already written stay in the thread (they show their English text on the older server, which does not read their code) and the older server writes no new ones.

### Depends on
- Client: CLIENT-SESSION-34 (form, Schedule button and en/vi copy for the new error codes). Ship the server and the client together.
- Client: the SESSION-49 part (pre-filled, required title). An older client that lets the title be blank gets a `400 SESSION_TITLE_REQUIRED` it has no copy for.
- Client: CLIENT-GL-38 (the Result section and dialog, en/vi copy for the `SESSION_RECORD_*` codes) and SPORT-18 (admin screen; until it ships, the schema is set with the admin `PUT`). The endpoints work without the client. A client that ignores `results` would show a rejected record as saved, so the client must read each result's `status` after Save.
- Client: CLIENT-GL-50 part 2 (tagging in group posts and their comments) calls the B23 endpoint; it needs the group module's `V090`-based name search, so SESSION-GL-64 must be deployed first (same release). The endpoint works without the client.
- Client: CLIENT-GL-50 (tagging picker, the shared name matcher and the friend-invite filter) uses `thread-people`; the endpoint works without it. The Friends page and group invite search keep working unchanged against the new `users/search` rule.
- Client: CLIENT-GL-51 (already merged) hides the Leave button after the cutoff and carries the en/vi text for `SESSION_LEAVE_TOO_LATE`. Deploy this server before that client: a client without it shows the code as a generic error.
- Client: CLIENT-NOTIF-7 shows the reason under a rejected-request notification and adds the "Clear read" control that calls the delete. The server change is additive, so ship the server first: until that client is released the reason is returned but not shown and nothing calls the endpoint.
- Client: CLIENT-SESSION-51 shows the SESSION-67 comments in en and vi. Ship either order: until it is released every comment shows its stored English text.

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
- SESSION-GL-63: none to deploy first. The client (CLIENT-GL-51) shows system entries and the new notification in en and vi; until it ships, the thread shows the English `content` and the new notification type shows the client's generic text. Deploy the server first.
