# SESSION-GROUP-4 · Group session settings and recurrence configurations (data and CRUD, no generation)

**Status:** `TODO`
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
