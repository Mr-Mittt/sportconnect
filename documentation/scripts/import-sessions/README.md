# import-sessions

Turns one monthly results sheet of an `.xlsx` into the JSON file the admin import page uploads (SESSION-71). It only reads the
workbook and writes a file: **no network, no token, no user ids.** The page (`/admin/import`, CLIENT-ADMIN-IMPORT-1) chooses the
group and the location, and the server (SESSION-70, `POST /api/sessions/import/preview` and `/import`) matches the names against
that group's members.

## Run it

Once, in this folder (installs `exceljs`):

```bash
cd documentation/scripts/import-sessions
npm install
```

Then, for the sheet `102026` (October 2026) of the downloaded workbook:

```bash
node import-sessions.mjs --file "C:/Users/me/Downloads/results.xlsx" --sheet 102026 --out sessions-102026.json
```

It prints one line per session (date, number of games, title), the blocks it skipped and why, any warnings, the distinct names in
the games (check their spelling) and the totals, then writes the file. It overwrites `--out`.

| Option | Meaning |
|---|---|
| `--file` | the downloaded workbook (required; quote the path) |
| `--sheet` | the sheet's name (required). The name is the month: `102026` = October 2026, `92026` = September 2026 |
| `--out` | the file to write (default `sessions.json` in the folder you run it from) |
| `--month YYYY-MM` | only when the sheet name is not `MMYYYY` (for example `122024.`); a block dated in another month is skipped |
| `--start`, `--end` | local start and end of every session (default `07:00` and `09:00`) |
| `--title` | the session title; `{date}` becomes `29th, Oct 2026` (default `BkBg's session on {date}`) |

Exit code: `0` when a file was written (warnings do not fail it); `1` when the file or the sheet is missing, the month is unknown, an
option is wrong, or the sheet holds no importable session (then nothing is written).

## Then upload it

1. Sign in to the app as an ADMIN and open `/admin/import`.
2. Choose the file, type the **group id** and the **location id**, and press **Preview**.
3. For each name the server could not match to exactly one member (no member has that first name, or several do), choose the
   member from the dropdown.
4. Press **Apply**. A session already imported (same group, title and start) is skipped, so applying again is safe.

## What it reads from the sheet

Verified on sheet `102026` (2026-11-22).

- A **session** is a block that starts at each date in column **B**, from row 40 down (a merged B:F cell holding a formula; the
  script reads the formula's cached result, so use a workbook downloaded from Google Sheets or saved by Excel).
- The rows below the date, until the next date, are the **games**, one per row: columns **B** and **C** the winning pair, **E** and
  **F** the losing pair. There is no score. The marker in column D (`WIN` / `Win`) is not read.
- Column **H** (the roster) and the money columns are ignored.
- A block is **skipped** (and listed) when its date is outside the sheet's month or it has no complete game. A game row with fewer
  than four names is a **warning** with its row number, never guessed.
- Sessions come out oldest first.

## The file it writes

```json
{
  "sheet": "102026",
  "sessions": [
    {
      "title": "BkBg's session on 29th, Oct 2026",
      "localDate": "2026-10-29",
      "startTime": "07:00",
      "endTime": "09:00",
      "games": [{ "winners": ["Hiếu", "Đức"], "losers": ["Bảo", "Viên"] }]
    }
  ]
}
```

`sessions` is the list SESSION-70's request takes (the date and times are read in the location's timezone by the server).

## Tests

```bash
npm test
```

`node --test` over a small workbook built in memory by `sheet.test.mjs`: month parsing, the block and game rules, the options and
the command line itself.

Related: `modules/session/docs/MVP/SESSION-71_OFFLINE_SCRIPT_THAT_TURNS_A_SHEET_INTO_THE_IMPORT_FILE.md`,
`modules/session/docs/MVP/SESSION-70_ADMIN_IMPORT_OF_FINISHED_SESSIONS_WITH_THEIR_GAMES.md`,
`client/docs/MVP/CLIENT-ADMIN-IMPORT-1_ADMIN_PAGE_TO_IMPORT_FINISHED_SESSIONS.md`.
