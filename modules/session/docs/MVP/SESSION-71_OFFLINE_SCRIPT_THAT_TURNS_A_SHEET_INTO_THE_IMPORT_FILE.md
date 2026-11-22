# SESSION-71 · Offline script that turns a results sheet into the import file

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-70 (it defines the file's shape); the file is consumed by CLIENT-ADMIN-IMPORT-1
**Filed:** 2026-11-22, owner request with SESSION-70: many monthly sheets to load, so the reading step must be a reusable script, not a one-off.

`documentation/scripts/import-sessions/` (Node, `exceljs`, like `add-test-data`): `node import-sessions.mjs --file <xlsx> --sheet <name> [--out sessions.json] [--start 07:00 --end 09:00] [--title "BkBg's session on {d}"]`. It **reads the workbook only: no network, no token, no ids.** It writes the JSON of SESSION-70's `sessions` list and prints a summary (per session: date, number of games, players) to check against the sheet before uploading.

**How the sheet is read** (verified on sheet `102026`, 2026-11-22). The sheet name is the month (`MMYYYY`). Each session is a 22-row block starting at row 43 in column B: the merged cell B:F holds the date (a formula; read its cached result), the 21 rows below hold up to 21 games, one per row: columns B and C the winning pair, D the "WIN" marker, E and F the losing pair; no score. A block is skipped when its date is not in the sheet's month or it has no complete game row (four names). **Column H (the roster) and the money columns are ignored.** Title pattern: "BkBg's session on 29th, Oct 2026"; start and end default to 07:00 and 09:00 local, overridable. Output order follows the date, oldest first.

**Edge cases.** A row with fewer than four names is reported as a warning, not guessed; a block with a non-date in B is reported; a sheet that does not exist lists the sheet names. The script never writes to the workbook.

**Out of scope:** talking to the server, matching names to members (SESSION-70), reading a Google Sheet directly (the owner downloads the `.xlsx`), scores, guests.

**Tests:** a Node test over a small fixture workbook (a block in range, one outside the month, an empty one, a partial row, the `Win` / `WIN` marker); the `102026` sheet as the first live check: expected 11 sessions, 83 games.
