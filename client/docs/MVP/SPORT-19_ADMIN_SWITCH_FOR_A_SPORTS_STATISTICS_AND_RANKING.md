# SPORT-19 · Admin: switch statistics and ranking on or off for a sport

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-53 (the sport's `statisticsEnabled` field, added by its 2026-11-25 rework)
**Filed:** 2026-11-25, from the SESSION-53 rework (owner decision): a sport has one switch for statistics and ranking, off by default; the statistics runner and the ranking proposal check it. The server side is built in SESSION-53; this is the admin screen.

The server's `SportResponse` (and `CreateSportRequest`, `UpdateSportRequest`) gain an optional boolean `statisticsEnabled`; `PUT /api/sports/{sportId}` with `{ "statisticsEnabled": true }` switches it on, a request that does not mention it leaves it as it is, a sport created without it is off.

- Add `statisticsEnabled` to the sport type in `shared/types/sport.ts` and to the MSW sport mocks and handlers (`client/e2e/mocks`), so the field is read and sent as the server shapes it.
- In the admin sport detail (`/admin/sports/:sportId`), next to the "Record schema" section (SPORT-18): a switch "Statistics and ranking" that sends the update and shows the saved state; the change takes effect on the server at once (the sport cache is evicted by the write). A short hint says what it does: the server counts finished sessions and allows ranking games only for a sport that has it on, and it counts only what the sport's `record.scoreboard.columns` list.
- A non-blocking note when the switch is on but the sport's record schema has no `record.scoreboard.columns` (the server then collects nothing: `STATISTICS_NOT_CONFIGURED`), the same kind of note the schema editor already shows when it cannot read the document.
- en and vi copy for the label, the hint and the note, in the same ticket (`client/CLAUDE.md` § i18n). No new error code (the update's existing errors apply).
- The sport catalog table may show the state as a badge (optional, same ticket if it is small).

**Out of scope:** the statistics and board screens (CLIENT-SESSION-41, 42), hiding the propose action for a sport that has the switch off (CLIENT-SESSION-54 carries that), a per-group or per-season switch.

**Tests:** Vitest for the switch (on, off, failure keeps the old state), the note, and the type; a scoped e2e with MSW; mutation check. Visual baselines: the admin sport detail is baselined if it is covered, otherwise none; list the expected change in the open baseline ticket.
