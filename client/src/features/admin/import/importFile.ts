import type { ImportFile, ImportedGame, ImportedSession } from './types';

/** Most sessions the server takes in one call (SESSION-70). */
export const MAX_IMPORT_SESSIONS = 100;

export type ImportFileProblem = 'NOT_JSON' | 'NOT_AN_IMPORT_FILE' | 'TOO_MANY_SESSIONS';

export type ImportFileResult =
  | { ok: true; file: ImportFile }
  | { ok: false; problem: ImportFileProblem };

/** The fixed English text of each problem (admin screens are English-only, CLIENT-I18N-6). */
export const IMPORT_FILE_PROBLEMS: Record<ImportFileProblem, string> = {
  NOT_JSON: "This file isn't valid JSON.",
  NOT_AN_IMPORT_FILE: "This isn't an import file made by the sheet script.",
  TOO_MANY_SESSIONS: `A file can hold at most ${MAX_IMPORT_SESSIONS} sessions. Split it and import the parts one by one.`,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === 'string' && n.trim() !== '');
}

function isGame(value: unknown): value is ImportedGame {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Record<string, unknown>;
  return isNames(game.winners) && isNames(game.losers);
}

function isSession(value: unknown): value is ImportedSession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.title === 'string' && s.title.trim() !== '' &&
    typeof s.localDate === 'string' && DATE.test(s.localDate) &&
    typeof s.startTime === 'string' && TIME.test(s.startTime) &&
    typeof s.endTime === 'string' && TIME.test(s.endTime) &&
    Array.isArray(s.games) && s.games.length > 0 && s.games.every(isGame)
  );
}

/**
 * Reads the text of an uploaded file as an import file: `{ sheet?, sessions: [...] }` with 1 to
 * {@link MAX_IMPORT_SESSIONS} sessions, each with a title, a date, start and end times and at least one game of named
 * winners and losers. This only checks the shape; the server judges everything else (names, dates, the sport's limits).
 */
export function parseImportFile(text: string): ImportFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'NOT_JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { sessions?: unknown }).sessions)) {
    return { ok: false, problem: 'NOT_AN_IMPORT_FILE' };
  }
  const { sheet, sessions } = parsed as { sheet?: unknown; sessions: unknown[] };
  if (sessions.length === 0 || !sessions.every(isSession)) {
    return { ok: false, problem: 'NOT_AN_IMPORT_FILE' };
  }
  if (sessions.length > MAX_IMPORT_SESSIONS) {
    return { ok: false, problem: 'TOO_MANY_SESSIONS' };
  }
  return { ok: true, file: { sheet: typeof sheet === 'string' ? sheet : undefined, sessions: sessions as ImportedSession[] } };
}
