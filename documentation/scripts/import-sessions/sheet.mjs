/**
 * SESSION-71: the pure part of the sheet-to-import-file script (no file or console access, so it can be tested with a
 * workbook built in memory). Layout of a monthly results sheet, verified on sheet `102026` (2026-11-22):
 *
 *   - Each session is a block. Its first row has the date in column B (a merged B:F cell holding a formula: the value is
 *     the formula's cached result). The rows below, until the next block's date, are the games.
 *   - A game is one row: columns B and C the winning pair, D a "WIN" marker (ignored), E and F the losing pair. No score.
 *   - Column H (a roster) and every money column are ignored.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The first row scanned for a block's date: the sheet's summary tables are above it. */
export const FIRST_BLOCK_ROW = 40;

/** Columns (1-based) holding the names of a game: winners B and C, losers E and F. */
const WINNER_COLUMNS = [2, 3];
const LOSER_COLUMNS = [5, 6];
const DATE_COLUMN = 2;

/**
 * `102026` is October 2026 and `92026` September 2026: the last four digits are the year, the rest the month.
 * Anything else (`Sheet28`, `122024.`, `Template`) is not a month sheet and returns null.
 */
export function parseSheetMonth(sheetName) {
  const m = /^(\d{1,2})(\d{4})$/.exec(String(sheetName).trim());
  if (!m) return null;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 ? { year: Number(m[2]), month } : null;
}

/** `--month 2026-10` as the same shape as {@link parseSheetMonth}; null when it is not `YYYY-MM`. */
export function parseMonthOption(text) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd. */
export function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** `2026-10-29` as `29th, Oct 2026`. */
export function formatDate(localDate) {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${ordinal(day)}, ${MONTHS[month - 1]} ${year}`;
}

/** The session title: every `{date}` of the template becomes the formatted date. */
export function formatTitle(template, localDate) {
  return template.split('{date}').join(formatDate(localDate));
}

/**
 * The value of a cell as plain data: a formula's cached result, the text of a rich-text cell, a hyperlink's text. A formula
 * the workbook never calculated (no cached result) is `undefined`, so the caller can tell it from an empty cell.
 */
export function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v || 'result' in v) return v.result ?? undefined;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

/** The text of a name cell: trimmed, empty string when there is none. */
function nameOf(cell) {
  const v = cellValue(cell);
  return v === null || v === undefined ? '' : String(v).trim();
}

/** A date cell is read by its UTC parts: a date-only cell is stored as UTC midnight, so no timezone can move it a day. */
function localDateOf(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Reads the sessions of one month sheet.
 *
 * @param worksheet an ExcelJS worksheet
 * @param options `month` ({year, month}), `start` and `end` ("HH:MM"), `titleTemplate` (contains `{date}`)
 * @returns `{ sessions, skipped, warnings }`: `sessions` oldest first, each `{ title, localDate, startTime, endTime, games }`
 *   with `games` as `{ winners: [name, name], losers: [name, name] }`; `skipped` the blocks left out (`{ row, localDate, reason }`);
 *   `warnings` what looked wrong without being guessed at (`{ row, message }`).
 */
export function readSessions(worksheet, { month, start, end, titleTemplate }) {
  const sessions = [];
  const skipped = [];
  const warnings = [];

  const heads = [];
  for (let row = FIRST_BLOCK_ROW; row <= worksheet.rowCount; row++) {
    const value = cellValue(worksheet.getCell(row, DATE_COLUMN));
    if (value instanceof Date) {
      heads.push({ row, date: value });
    } else if (value === undefined) {
      warnings.push({ row, message: 'a date formula with no calculated value (open and save the workbook in Excel or download it from Google Sheets again); the block is not read' });
    }
  }

  heads.forEach((head, index) => {
    const localDate = localDateOf(head.date);
    if (head.date.getUTCFullYear() !== month.year || head.date.getUTCMonth() + 1 !== month.month) {
      skipped.push({ row: head.row, localDate, reason: `not in ${month.year}-${String(month.month).padStart(2, '0')}` });
      return;
    }
    const lastRow = index + 1 < heads.length ? heads[index + 1].row - 1 : worksheet.rowCount;
    const games = [];
    for (let row = head.row + 1; row <= lastRow; row++) {
      const winners = WINNER_COLUMNS.map((c) => nameOf(worksheet.getCell(row, c)));
      const losers = LOSER_COLUMNS.map((c) => nameOf(worksheet.getCell(row, c)));
      const all = [...winners, ...losers];
      const named = all.filter((n) => n !== '').length;
      if (named === 4) {
        games.push({ winners, losers });
      } else if (named > 0) {
        warnings.push({ row, message: `a game row with ${named} of 4 names, left out (${localDate})` });
      }
    }
    if (games.length === 0) {
      skipped.push({ row: head.row, localDate, reason: 'no complete game' });
      return;
    }
    sessions.push({
      title: formatTitle(titleTemplate, localDate),
      localDate,
      startTime: start,
      endTime: end,
      games,
    });
  });

  sessions.sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  return { sessions, skipped, warnings };
}

/** The file the admin import page uploads: the `sessions` list of SESSION-70's request, plus the sheet it came from. */
export function buildOutput(sheetName, sessions) {
  return { sheet: sheetName, sessions };
}

/** The distinct names that appear in the games of these sessions, in first-seen order. */
export function distinctNames(sessions) {
  const seen = new Set();
  for (const s of sessions) {
    for (const g of s.games) {
      for (const n of [...g.winners, ...g.losers]) seen.add(n);
    }
  }
  return [...seen];
}
