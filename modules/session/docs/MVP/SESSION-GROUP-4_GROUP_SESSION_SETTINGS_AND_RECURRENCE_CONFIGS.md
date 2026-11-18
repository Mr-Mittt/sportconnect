# SESSION-GROUP-4 · Group session settings and recurrence configurations (data and CRUD, no generation)

**Status:** `DONE` (2026-11-19)
**Type:** New Feature · **Depends on:** SESSION-GROUP-1 (audience model); client pairs: CLIENT-GROUP-SESSION-4 and -5
**Filed:** 2026-11-19, from the owner's specification ("Configuration"). It replaces the single weekly rule on `groups` (GROUP-RECUR-1, B22); the old columns stay until GROUP-1 removes them, so the two coexist and the generator still reads only the old rule until SESSION-GROUP-5. Folds in B22 (game mood) and the data side of GRP-12.

**Ownership.** The session domain owns the data and the endpoints (`/api/sessions/group/{groupId}/...`, session-impl). It calls `group-api` for membership, role (`canManageMembers`: owner/admin write, any member read), the group's sport and owner.

**Data** (one Liquibase changelog; next free `V` number at pickup):
- `group_session_settings` (`group_id` PK, `enabled`, `mode` WEEKLY|MONTHLY). No row means OFF and WEEKLY.
- `group_session_recurrences`: `id`, `group_id`, `mode`, `day_key` (1 to 7 weekday, or 1 to 31 month-day), `start_time` (local time), `duration_minutes`, `location_id`, `location_note`, `audience` (ALL_MEMBERS|SPECIFIC), `fee_type`, `fee_amount_vnd`, `fee_note`, `game_mood`, `attributes` (jsonb), `is_draft`, timestamps; `group_session_recurrence_members` (`recurrence_id`, `user_id`) for SPECIFIC (no cap, members only, as SESSION-GROUP-1).
- A config is **active** when `config.mode == settings.mode`. Switching the mode changes no row; configs of the other mode are simply inert until the owner switches back.

**Endpoints.** `GET/PUT .../settings` (`enabled`, `mode`); `GET/POST/PUT/DELETE .../recurrences[/{id}]`. Delete is a hard delete.

**Rules (owner, 2026-11-19).**
- **Required:** `day_key` and `start_time` (400 coded when missing). **Draft:** a config is saved as a draft (`is_draft = true`, computed on save, never sent by the client) when location or duration is missing; fee defaults to free. Only non-draft configs of the active mode ever generate (SESSION-GROUP-5).
- **Limit:** at most 5 configs per group, mode and `day_key` (drafts count): coded 409 on the sixth.
- **Location:** its sport must equal the group's sport (reuse `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`); the group needs a sport (confirm it cannot change after creation, grep for a path). The timezone is the location's; a draft without a location has none and is never generated.
- **Editing a config** affects only future generation; sessions already generated keep their values. It runs the same generation check as adding one (SESSION-GROUP-5).
- **Group system post:** every create, update, delete, ON/OFF change and mode switch writes a **system post** in the group's feed telling members what changed (the B9 precedent: authored as the group's current owner, no system-user account; use the existing system-post path in `post-api`, and a new `SystemCode` per change kind with `old`/`new` params so the client localises it, SESSION-67 style). The exact post type and texts are fixed at pickup after reading B9 and `SessionFieldChanges`.
- **Permissions:** a member who is not owner/admin gets 403 on every write and may read; a non-member gets 403; an unknown or inactive group is 404 first.

**Consumer census:** `GroupController` recurrence endpoints and `GroupRecurrenceConfigResponse` (untouched here), `PostService` system-post API and its `SystemCode` mirror on the client (new values, I18N-5), `GroupService` (role checks), `GROUP-RECUR-1` and B22 tickets (B22 closes as superseded when GROUP-1 lands), client `errors.json` for the new codes. **Account lifecycle:** JWT filter per request; every write is by an active owner/admin; the new codes are added to `ERROR_CODES.md`.

**Out of scope:** generating anything (SESSION-GROUP-5), cancelling sessions on delete (SESSION-GROUP-6), removing the old rule (GROUP-1), the UI.

**Tests:** Spock for validation, draft computation, the 5-per-day limit, mode activity; ITs through the real pipeline for the permission matrix (owner, admin, member, non-member, deactivated), the 404-before-403 order, the limit, hard delete, the system post written for each change kind, and a mode switch leaving rows untouched. Mutation check each requirement.

---

## Implementation summary (2026-11-19)

**Built as filed.** Configuration only: nothing is generated from it (SESSION-GROUP-5), and the old single rule on `groups` is untouched.
- **Tables (V095):** `group_session_settings` (no row = off and `WEEKLY`), `group_session_recurrences` and `group_session_recurrence_members` (FK and cascade to its recurrence), one index `(group_id, mode, day_key, start_time)`. Entities, repositories and the H2 mirror follow.
- **Endpoints** (`GroupSessionConfigController`, `/api/sessions/group/{groupId}`): `GET/PUT /settings` (partial `{ enabled?, mode? }`; a no-op saves nothing and writes no post; no row is created for it) and `GET /recurrences`, `POST /recurrences`, `PUT` and `DELETE /recurrences/{id}`. Read = any member; write = `canManageMembers`. A missing or inactive group is 404 `GROUP_NOT_FOUND` before any permission answer, then a plain member is 403 `SESSION_GROUP_ADMIN_REQUIRED` and a non-member 403 `SESSION_GROUP_MEMBER_REQUIRED`.
- **Configuration rules:** a new one takes the group's current mode, and a mode never changes afterwards; it is **active** only while the group's mode equals it, so a mode switch touches no row. `dayKey` must fit the mode (`RecurrenceMode`: 1-7 or 1-31, 400 `SESSION_RECURRENCE_DAY_INVALID`) and `startTime` is required (400 `SESSION_RECURRENCE_START_REQUIRED`). **Draft** is computed on every save: no location, no duration, or a FIXED fee without an amount (the response adds `missing`, naming which). At most 5 per (group, mode, day), drafts included (409 `SESSION_RECURRENCE_DAY_LIMIT`, an update excludes itself). The location's sport must equal the group's (existing `GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`); a group with no sport cannot have configurations (`SESSION_SPORT_REQUIRED`; no code path changes a group's sport after creation: checked, there is no setter outside creation). Fee defaults to free (a non-FIXED fee drops its amount), game mood to 5 (B22's content), blank notes become null, attributes go through the sport's session schema.
- **Audience:** `ALL_MEMBERS` or `SPECIFIC` + `audienceUserIds` (at least one, every id a member, no cap), the same rule as a custom session (`GroupAudiences`, now shared). A replace swaps the audience rows with delete, flush, insert.
- **The group post:** every change (add, replace, delete, generation on or off, mode switched) writes a `GROUP_SYSTEM` post in the same transaction through `PostService.createSystemPost`, authored as the group's current owner (new `GroupService.getGroupOwnerId`, the B9 rule, no system user), with six new `SystemCode` values and an English fallback text ("{name} added a weekly session on Monday at 18:30", ordinals for monthly). The client texts are in CLIENT-GROUP-SESSION-4's contract note.
- **Refactors the work needed:** `SessionAttributeResolver` (the session attribute filter and its 4 KB cap, extracted from `SessionServiceImpl`, which now takes it instead of `ObjectMapper`; the spec constructor changed by one argument) and `GroupAudiences.validateSpecific` (extracted from `createSession`).

**Corrections and notes.**
- The Swagger text of the share endpoint (`SessionController`) still said a group session is refused; fixed here (a SESSION-GROUP-3 leftover).
- Unlike `GET /sessions/group/{id}` (SESSION-GROUP-2, one 403 for everything), these endpoints answer 404 for a missing group first, as this ticket filed.
- The 5-per-day limit is a count then insert, not locked: two simultaneous creates on the same day could both pass. Accepted for now (a handful of admins per group); a lock on the settings row is the fix if it ever matters.
- The old `groups.recurrence_*` rule and `GET/PUT /api/groups/{id}/recurrence` are unchanged and still the only thing the generator reads.

**Consumer census (done before editing).** All three tables and the four endpoints are new (no existing consumer). `GroupService.getGroupOwnerId` is a new interface method with one implementer (`GroupServiceImpl`); the only other users of the interface are mocks. `SystemCode` gained six values: the client shows an unknown code's stored English text (documented in the enum), the en/vi copy is CLIENT-GROUP-SESSION-4 (contract note added to that ticket and to -5). `SessionServiceImpl`'s two attribute call sites and `resolveSpecificAudience` now delegate (behaviour unchanged, the existing specs pass). `SecurityConfig`: nothing public is added (`/api/sessions/**` is authenticated by default).

**Tests.** `GroupSessionConfigServiceImplSpec` (62: access matrix, settings, mode, day validation, draft, fee and mood defaults, attributes, audience, the limit, update ordering, delete, list in one members query, the post texts and authoring) and `GroupSessionConfigIntegrationTest` (16: defaults, owner and admin change settings with the post authored by the owner, a no-op writes nothing, plain member and outsider refused, missing and inactive group 404, create in the current mode, drafts and `missing`, required fields, location mismatch, the sixth per day 409 and another day or mode fine, audience stored, replaced and refused, update and the full-day move, hard delete with audience removed and a member refused, another group's configuration not found, list order). Session-impl 537, group-impl 203, post-impl 156, notification-impl 74 and 131 server ITs green. Mutation check: 18 of 18 killed against a passing baseline (62 tests). **Not run:** V095 against a real Postgres (the ITs use the H2 mirror; the SQL uses `BIGSERIAL`, `TIME`, `JSONB`, `CHECK` and `ON DELETE CASCADE`, all standard), the full `:server:test`, a live server.
