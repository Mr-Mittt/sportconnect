// A date-only cell is UTC midnight. Run in a timezone behind UTC, where reading the local date would give the day before.
process.env.TZ = 'America/Los_Angeles';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import {
  buildOutput, cellValue, distinctNames, formatDate, formatTitle, ordinal, parseMonthOption, parseSheetMonth, readSessions,
} from './sheet.mjs';

const OPTIONS = { month: { year: 2026, month: 10 }, start: '07:00', end: '09:00', titleTemplate: "BkBg's session on {date}" };

/**
 * A month sheet like the real one: summary rows above row 40, then blocks. `blocks`: `{ row, date: [y, m, d], games: [[w1, w2, l1, l2]], marker, roster, formula }`.
 * `formula: false` writes a plain date cell, `'nocache'` a formula without a calculated value. The workbook is written to a buffer
 * and loaded again, so the cells are what a downloaded file has (a formula keeps its cached result).
 */
async function sheetWith(blocks, sheetName = '102026') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.getCell('B10').value = new Date(Date.UTC(2026, 9, 1)); // a date above the blocks must not start one
  for (const b of blocks) {
    const [y, m, d] = b.date;
    const date = new Date(Date.UTC(y, m - 1, d));
    const head = ws.getCell(b.row, 2);
    if (b.formula === false) head.value = date;
    else if (b.formula === 'nocache') head.value = { formula: `DATE(${y},${m},${d})` };
    else head.value = { formula: `DATE(${y},${m},${d})`, result: date };
    ws.mergeCells(b.row, 2, b.row, 6);
    ws.getCell(b.row, 8).value = 'RosterNameInHeadRow';
    (b.games ?? []).forEach((g, i) => {
      const r = b.row + 1 + i;
      ws.getCell(r, 2).value = g[0];
      ws.getCell(r, 3).value = g[1];
      ws.getCell(r, 4).value = b.marker ?? 'WIN';
      ws.getCell(r, 5).value = g[2];
      ws.getCell(r, 6).value = g[3];
      ws.getCell(r, 8).value = 'Roster' + i;
    });
    for (const extra of b.rows ?? []) {
      const r = b.row + 1 + extra.at;
      extra.cells.forEach((v, i) => { if (v) ws.getCell(r, [2, 3, 5, 6][i]).value = v; });
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded.getWorksheet(sheetName);
}

const G = [['Hiếu', 'Đức', 'Bảo', 'Viên'], ['Bảo', 'Viên', 'Hiếu', 'Đức']];

// ---- month and text helpers ------------------------------------------------------------------------------------------

test('a sheet named MMYYYY is a month; anything else is not', () => {
  assert.deepEqual(parseSheetMonth('102026'), { year: 2026, month: 10 });
  assert.deepEqual(parseSheetMonth('92026'), { year: 2026, month: 9 });
  assert.deepEqual(parseSheetMonth('12025'), { year: 2025, month: 1 });
  assert.equal(parseSheetMonth('122024.'), null);
  assert.equal(parseSheetMonth('Sheet28'), null);
  assert.equal(parseSheetMonth('Template'), null);
  assert.equal(parseSheetMonth('132026'), null);
});

test('--month is YYYY-MM', () => {
  assert.deepEqual(parseMonthOption('2026-10'), { year: 2026, month: 10 });
  assert.equal(parseMonthOption('2026-13'), null);
  assert.equal(parseMonthOption('10/2026'), null);
});

test('ordinal suffixes, including the teens', () => {
  const expected = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 24: '24th', 29: '29th', 30: '30th', 31: '31st' };
  for (const [n, text] of Object.entries(expected)) assert.equal(ordinal(Number(n)), text);
});

test('a date and a title are formatted from the template', () => {
  assert.equal(formatDate('2026-10-29'), '29th, Oct 2026');
  assert.equal(formatDate('2026-01-01'), '1st, Jan 2026');
  assert.equal(formatTitle("BkBg's session on {date}", '2026-10-29'), "BkBg's session on 29th, Oct 2026");
  assert.equal(formatTitle('{date} / {date}', '2026-10-02'), '2nd, Oct 2026 / 2nd, Oct 2026');
});

// ---- reading a sheet -------------------------------------------------------------------------------------------------

test('a block in the month becomes a session with its games, winners first', async () => {
  const ws = await sheetWith([{ row: 65, date: [2026, 10, 29], games: G }]);
  const { sessions, skipped, warnings } = readSessions(ws, OPTIONS);
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    title: "BkBg's session on 29th, Oct 2026",
    localDate: '2026-10-29',
    startTime: '07:00',
    endTime: '09:00',
    games: [
      { winners: ['Hiếu', 'Đức'], losers: ['Bảo', 'Viên'] },
      { winners: ['Bảo', 'Viên'], losers: ['Hiếu', 'Đức'] },
    ],
  });
  assert.deepEqual(skipped, []);
  assert.deepEqual(warnings, []);
});

test('the date is read from its UTC parts, from a formula result or a plain date cell', async () => {
  const ws = await sheetWith([
    { row: 65, date: [2026, 10, 1], games: G, formula: false },
    { row: 87, date: [2026, 10, 31], games: G },
  ]);
  assert.deepEqual(readSessions(ws, OPTIONS).sessions.map((s) => s.localDate), ['2026-10-01', '2026-10-31']);
});

test('a block dated in another month is skipped and reported', async () => {
  const ws = await sheetWith([
    { row: 65, date: [2026, 10, 29], games: G },
    { row: 87, date: [2026, 9, 29], games: G },
    { row: 109, date: [2025, 10, 5], games: G },
  ]);
  const { sessions, skipped } = readSessions(ws, OPTIONS);
  assert.deepEqual(sessions.map((s) => s.localDate), ['2026-10-29']);
  assert.deepEqual(skipped.map((k) => [k.localDate, k.reason]), [
    ['2026-09-29', 'not in 2026-10'],
    ['2025-10-05', 'not in 2026-10'],
  ]);
});

test('a block with no complete game is skipped (the WIN markers alone are not games)', async () => {
  const ws = await sheetWith([
    { row: 65, date: [2026, 10, 29], games: G },
    { row: 87, date: [2026, 10, 27], games: [], rows: [{ at: 0, cells: [] }] },
  ]);
  ws.getCell(88, 4).value = 'Win';
  ws.getCell(89, 4).value = 'Win';
  const { sessions, skipped } = readSessions(ws, OPTIONS);
  assert.deepEqual(sessions.map((s) => s.localDate), ['2026-10-29']);
  assert.deepEqual(skipped, [{ row: 87, localDate: '2026-10-27', reason: 'no complete game' }]);
});

test('a game row with fewer than four names is reported with its row, not guessed', async () => {
  const ws = await sheetWith([{
    row: 65, date: [2026, 10, 29], games: [G[0]],
    rows: [{ at: 1, cells: ['Hiếu', 'Đức', 'Bảo', null] }, { at: 2, cells: ['Hiếu', null, null, null] }],
  }]);
  const { sessions, warnings } = readSessions(ws, OPTIONS);
  assert.equal(sessions[0].games.length, 1);
  assert.deepEqual(warnings.map((w) => w.row), [67, 68]);
  assert.match(warnings[0].message, /3 of 4 names/);
  assert.match(warnings[1].message, /1 of 4 names/);
});

test('the WIN / Win marker in column D and the roster in column H are ignored', async () => {
  const ws = await sheetWith([{ row: 65, date: [2026, 10, 29], games: G, marker: 'Win' }]);
  const { sessions } = readSessions(ws, OPTIONS);
  const all = JSON.stringify(sessions);
  assert.ok(!all.includes('Roster'));
  assert.ok(!all.includes('Win') && !all.includes('WIN'));
});

test('a date formula with no calculated value is reported and its block not read', async () => {
  const ws = await sheetWith([
    { row: 65, date: [2026, 10, 29], games: G, formula: 'nocache' },
    { row: 87, date: [2026, 10, 27], games: G },
  ]);
  const { sessions, warnings } = readSessions(ws, OPTIONS);
  assert.deepEqual(sessions.map((s) => s.localDate), ['2026-10-27']);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].row, 65);
  assert.match(warnings[0].message, /no calculated value/);
});

test('rows above row 40 never start a block, whatever they hold', async () => {
  const ws = await sheetWith([{ row: 65, date: [2026, 10, 29], games: G }]);
  const { sessions, skipped, warnings } = readSessions(ws, OPTIONS);
  assert.deepEqual(sessions.map((s) => s.localDate), ['2026-10-29']);
  assert.deepEqual(skipped, []);
  assert.deepEqual(warnings, []);
});

test('sessions come out oldest first whatever order the sheet lists them in', async () => {
  const ws = await sheetWith([
    { row: 43, date: [2026, 10, 29], games: G },
    { row: 65, date: [2026, 10, 3], games: G },
    { row: 87, date: [2026, 10, 15], games: G },
  ]);
  assert.deepEqual(readSessions(ws, OPTIONS).sessions.map((s) => s.localDate), ['2026-10-03', '2026-10-15', '2026-10-29']);
});

test('the start, end and title options are used', async () => {
  const ws = await sheetWith([{ row: 65, date: [2026, 10, 2], games: G }]);
  const s = readSessions(ws, { ...OPTIONS, start: '18:30', end: '20:00', titleTemplate: 'Club night {date}' }).sessions[0];
  assert.equal(s.startTime, '18:30');
  assert.equal(s.endTime, '20:00');
  assert.equal(s.title, 'Club night 2nd, Oct 2026');
});

test('cell values: formula result, rich text, empty, uncalculated formula', () => {
  assert.equal(cellValue({ value: { formula: 'A1', result: 5 } }), 5);
  assert.equal(cellValue({ value: { richText: [{ text: 'Hi' }, { text: 'ếu' }] } }), 'Hiếu');
  assert.equal(cellValue({ value: null }), null);
  assert.equal(cellValue({ value: { formula: 'A1' } }), undefined);
});

test('the output is the sheet name and SESSION-70\'s sessions list; the distinct names keep their first-seen order', async () => {
  const ws = await sheetWith([{ row: 65, date: [2026, 10, 29], games: G }]);
  const { sessions } = readSessions(ws, OPTIONS);
  const out = buildOutput('102026', sessions);
  assert.deepEqual(Object.keys(out), ['sheet', 'sessions']);
  assert.deepEqual(Object.keys(out.sessions[0]), ['title', 'localDate', 'startTime', 'endTime', 'games']);
  assert.deepEqual(Object.keys(out.sessions[0].games[0]), ['winners', 'losers']);
  assert.deepEqual(distinctNames(sessions), ['Hiếu', 'Đức', 'Bảo', 'Viên']);
});

// ---- the command line ------------------------------------------------------------------------------------------------

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'import-sessions.mjs');

async function writeFixture(dir, blocks, sheetName = '102026') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const b of blocks) {
    const [y, m, d] = b.date;
    ws.getCell(b.row, 2).value = { formula: `DATE(${y},${m},${d})`, result: new Date(Date.UTC(y, m - 1, d)) };
    b.games.forEach((g, i) => {
      [2, 3, 4, 5, 6].forEach((c, k) => { ws.getCell(b.row + 1 + i, c).value = k === 2 ? 'WIN' : g[k < 2 ? k : k - 1]; });
    });
  }
  const file = path.join(dir, 'fixture.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('the command writes the file and exits 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-sessions-'));
  const file = await writeFixture(dir, [{ row: 65, date: [2026, 10, 29], games: G }]);
  const r = run(['--file', file, '--sheet', '102026'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
  assert.equal(out.sheet, '102026');
  assert.equal(out.sessions[0].title, "BkBg's session on 29th, Oct 2026");
  assert.match(r.stdout, /1 sessions, 2 games/);
  assert.match(r.stdout, /Hiếu, Đức, Bảo, Viên/);
});

test('the command fails and writes nothing when no session is found, the sheet is missing or the month is unknown', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-sessions-'));
  const file = await writeFixture(dir, [{ row: 65, date: [2026, 9, 29], games: G }]);

  const none = run(['--file', file, '--sheet', '102026'], dir);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no session to import/);

  const missing = run(['--file', file, '--sheet', '112026'], dir);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Sheets: 102026/);

  const dotted = await writeFixture(dir, [{ row: 65, date: [2026, 10, 29], games: G }], '122024.');
  const noMonth = run(['--file', dotted, '--sheet', '122024.'], dir);
  assert.equal(noMonth.status, 1);
  assert.match(noMonth.stderr, /--month/);
  const withMonth = run(['--file', dotted, '--sheet', '122024.', '--month', '2026-10'], dir);
  assert.equal(withMonth.status, 0, withMonth.stderr);

  fs.rmSync(path.join(dir, 'sessions.json'), { force: true });
  const bad = run(['--file', file, '--sheet', '102026', '--start', '9am'], dir);
  assert.equal(bad.status, 1);
  assert.equal(fs.existsSync(path.join(dir, 'sessions.json')), false);
});

test('a title without {date} and an end not after the start are refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-sessions-'));
  const file = await writeFixture(dir, [{ row: 65, date: [2026, 10, 29], games: G }]);
  assert.equal(run(['--file', file, '--sheet', '102026', '--title', 'Same'], dir).status, 1);
  assert.equal(run(['--file', file, '--sheet', '102026', '--start', '09:00', '--end', '07:00'], dir).status, 1);
});
