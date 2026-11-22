# SESSION-70 · Admin import of finished sessions with their games (preview and apply)

**Status:** `TODO`
**Type:** New Feature · **Depends on:** none (script pair: SESSION-71; admin page: CLIENT-ADMIN-IMPORT-1)
**Filed:** 2026-11-22, owner request: the group keeps a year of past sessions and their game results in a Google Sheet ("Cầu lông bé khỏe bé gáy", one sheet per month) and wants them in the app, locally first and then in production.

Two admin-only endpoints, `POST /api/sessions/import/preview` and `POST /api/sessions/import`, take a batch of finished sessions and create them through the normal session and result services (validation and the companion post still run; the session is created `COMPLETED`, never through the "start must be in the future" path).

**Request (both calls).** `groupId` (optional: a group session of that group when present, a standalone one otherwise), `locationId`, `hostUserId` (default: the group's owner), `sportId` (default: the group's sport), and a list of sessions: `title`, `localDate`, `startTime`, `endTime` (read in the location's timezone, stored as UTC plus timezone like any session) and `games`, in order, each with a `winners` pair and a `losers` pair of **names as the sheet writes them** (first names, no ids). Plus, for `apply`, `aliases`: a map from a sheet name to a user id, chosen by the admin.

**Name matching is the server's job.** A name is matched, accent-insensitively, by first name against the members of `groupId` (or the host's friends for a standalone import: decide at pickup); an alias wins over matching. `preview` returns, per session, each game with the matched user (id, display name) and the list of **unresolved names** (no match, or several, with the candidates). `apply` refuses with a coded error while any name is unresolved: nothing is created partially. The players of a session are the people in its games; each becomes a participant (`JOINED`), the host included.

**Result.** `apply` returns, per session, created or skipped. A session with the same group, title and start already present is **skipped, not duplicated** (so a re-run is safe).

**Checks.** Account lifecycle: admin only (`ADMIN` role from the token), the per-request gate refuses a deactivated caller; a deactivated player is an unresolved name, never a participant. Notifications: an import sends **none** (decide and log in `NOTIFICATION_USE_CASES.md` at pickup if the owner wants a digest). Client-visible: new `errorCode`s for an unresolved name, an unknown location or group, a host outside the group; their en/vi copy belongs to CLIENT-ADMIN-IMPORT-1. Consumer census at pickup: the session creation and record paths this reuses, `SecurityConfig`, the IT schema mirror.

**Out of scope:** scores (the sheet has none), guests, a UI (CLIENT-ADMIN-IMPORT-1), reading a spreadsheet (SESSION-71).

**Tests:** Spock for the matching and the skip rule; `server/src/test/.../integration` for admin vs non-admin vs deactivated, a real create of a past `COMPLETED` session with its games, an unresolved name creating nothing, and a repeated apply; a mutation check per requirement.
