#!/usr/bin/env node
/**
 * SESSION-71: turns one monthly results sheet of an .xlsx into the JSON file the admin import page uploads
 * (CLIENT-ADMIN-IMPORT-1, which sends it to POST /api/sessions/import/preview and /import, SESSION-70).
 *
 * Offline: reads the workbook and writes a file. No network, no token, no user ids: the page chooses the group, location and
 * host, and the server matches the names against that group's members.
 *
 * Usage:
 *   node import-sessions.mjs --file "Cau long.xlsx" --sheet 102026 [--out sessions.json]
 *        [--month 2026-10] [--start 07:00] [--end 09:00] [--title "BkBg's session on {date}"]
 *
 *   --file   the downloaded workbook (required)
 *   --sheet  the sheet's name (required); its name is the month: 102026 = October 2026, 92026 = September 2026
 *   --month  YYYY-MM, only when the sheet name is not MMYYYY (e.g. "122024."); a block dated in another month is skipped
 *   --start / --end  local start and end of every session (default 07:00 and 09:00)
 *   --title  the session title; {date} becomes "29th, Oct 2026" (default "BkBg's session on {date}")
 *   --out    the file to write (default sessions.json, overwritten)
 *
 * What it reads: from row 40 down, a block starts at each date in column B; the rows below it are the games (winners in B
 * and C, losers in E and F; the WIN marker in D, the roster in H and the money columns are ignored). A game row with fewer
 * than four names is reported, never guessed. Prerequisite: `npm install` once in this folder (installs exceljs).
 *
 * Exit code: 0 when a file was written (warnings do not fail it), 1 when it could not read the sheet or found no session
 * (then nothing is written).
 */

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { buildOutput, distinctNames, parseMonthOption, parseSheetMonth, readSessions } from './sheet.mjs';

const DEFAULT_TITLE = "BkBg's session on {date}";

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    sheet: { type: 'string' },
    month: { type: 'string' },
    out: { type: 'string', default: 'sessions.json' },
    start: { type: 'string', default: '07:00' },
    end: { type: 'string', default: '09:00' },
    title: { type: 'string', default: DEFAULT_TITLE },
  },
});

if (!values.file || !values.sheet) {
  fail('--file and --sheet are required (see the header of import-sessions.mjs)');
}
for (const [name, value] of [['--start', values.start], ['--end', values.end]]) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(`${name} must be HH:MM, got "${value}"`);
}
if (values.end <= values.start) fail('--end must be after --start');
if (!values.title.includes('{date}')) fail('--title must contain {date}, or every session would get the same title');
if (!fs.existsSync(values.file)) fail(`file not found: ${values.file}`);

let month = null;
if (values.month) {
  month = parseMonthOption(values.month);
  if (!month) fail(`--month must be YYYY-MM, got "${values.month}"`);
} else {
  month = parseSheetMonth(values.sheet);
  if (!month) fail(`sheet "${values.sheet}" is not named like a month (MMYYYY, e.g. 102026): pass --month YYYY-MM`);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(values.file);
const worksheet = workbook.getWorksheet(values.sheet);
if (!worksheet) {
  fail(`no sheet named "${values.sheet}". Sheets: ${workbook.worksheets.map((w) => w.name).join(', ')}`);
}

const { sessions, skipped, warnings } = readSessions(worksheet, {
  month, start: values.start, end: values.end, titleTemplate: values.title,
});

for (const s of sessions) {
  console.log(`${s.localDate}  ${String(s.games.length).padStart(2)} games  ${s.title}`);
}
for (const k of skipped) console.log(`skipped row ${k.row} (${k.localDate}): ${k.reason}`);
for (const w of warnings) console.log(`warning row ${w.row}: ${w.message}`);

if (sessions.length === 0) {
  fail(`no session to import in sheet "${values.sheet}" for ${month.year}-${String(month.month).padStart(2, '0')}`);
}

fs.writeFileSync(values.out, JSON.stringify(buildOutput(values.sheet, sessions), null, 2) + '\n', 'utf8');
const totalGames = sessions.reduce((n, s) => n + s.games.length, 0);
console.log(`\nNames in the games (check the spelling): ${distinctNames(sessions).join(', ')}`);
console.log(`Wrote ${values.out}: ${sessions.length} sessions, ${totalGames} games (${skipped.length} blocks skipped, ${warnings.length} warnings).`);
