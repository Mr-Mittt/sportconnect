# SESSION-47 · Discover filters for per-gender slots and game mood

**Status:** `TODO`
**Type:** Enhancement · **Depends on:** SESSION-46 ·
**Filed:** 2026-11-11, deferred from SESSION-46 (rule 11 of `session-impl/CLAUDE.md`: a new `Session` field that a caller browsing Discover would plausibly filter by needs a filter ticket, not silence).

`GET /api/sessions/discover` (and `discover/counts`, which must stay consistent with it) gains AND-combined optional filters: a minimum number of slots for a gender (`minMaleSlots`, `minFemaleSlots`) and a range for the mood (`minGameMood`, `maxGameMood`, both within 1 to 10). Same shape and the same cast-the-`IS NULL`-side rule as the existing filters (`SessionRepository.findDiscoverSessions`, SESSION-25/26). Open for pickup: whether a session with null slots matches a `minFemaleSlots` filter (a null means "not specified", so probably not), and the client filter UI is its own client ticket, filed with this one.

**Out of scope:** the fields themselves (SESSION-46), the client filter UI.

**Tests:** repository/IT coverage through the real schema for each filter and for `discover/counts` agreeing with the list.
