# CLIENT-SESSION-38 · Session detail: collapsible Result section and nested edit dialog

**Status:** `TODO`
**Type:** Feature · **Depends on:** SESSION-50 (session backlog) ·
**Filed:** 2026-11-12, Filed 2026-11-12 by the `/feature` session "game logging" (BA document `D:\Planning\business-analyst\Requirements - Games, Statistics and Leaderboards.md`; design: `modules/session/docs/SESSION_RECORDS_DESIGN.md`).

In the session detail modal, under Players, a collapsible "Result / Kết quả" section, collapsed by default, shown for ONGOING/COMPLETED sessions whose sport has a result schema. It shows a client-computed scoreboard (games, wins, losses, net points from the schema's points rule) and the record list; the header "Update" button opens a nested dialog to add, edit and delete records.

The UI is built from the sport's result schema and the client validates the list (side sizes, no player on both sides, winner set, `maxRecords`, size). The dialog is a draft: it keeps each existing row's database `id` hidden (the #1, #2, #3 shown are display positions by creation order only), gives new rows a client UUID (`clientRef`), and on Save sends only the diff against its snapshot as one change set to `POST /api/sessions/{id}/records/changes`, then replaces its state with the response's fresh list. Disabled after the 24-hour window. Mobile first, one-handed, at most three taps once the players are chosen. En/vi copy including the `SESSION_RECORD_*` error codes (`errors:codes`), the sport's labels, MSW handlers, hand-mirrored types.

**Out of scope:** Chat commands (SESSION-51 / CLIENT-SESSION-39), guests, shortcuts, offline queue, duplicate warning, sharing, statistics views.

**Tests:** Vitest for the section, the dialog, the diff logic, the schema-driven validation and the scoreboard math; a scoped Playwright flow with MSW; requirement-by-requirement mutation check. Release-note lines in `documentation/release-notes/CLIENT.md`.
