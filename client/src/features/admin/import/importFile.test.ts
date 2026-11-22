import { describe, expect, it } from 'vitest';
import { IMPORT_FILE_PROBLEMS, MAX_IMPORT_SESSIONS, parseImportFile } from './importFile';

const game = { winners: ['Hiếu', 'Đức'], losers: ['Bảo', 'Viên'] };
const session = { title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', startTime: '07:00', endTime: '09:00', games: [game] };

describe('parseImportFile (CLIENT-ADMIN-IMPORT-1)', () => {
  it('reads the file the sheet script makes', () => {
    const result = parseImportFile(JSON.stringify({ sheet: '102026', sessions: [session] }));
    expect(result).toEqual({ ok: true, file: { sheet: '102026', sessions: [session] } });
  });

  it('takes a file without a sheet name', () => {
    const result = parseImportFile(JSON.stringify({ sessions: [session] }));
    expect(result.ok && result.file.sheet).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('refuses text that is not JSON', () => {
    expect(parseImportFile('not json')).toEqual({ ok: false, problem: 'NOT_JSON' });
  });

  it.each([
    ['an array', '[]'],
    ['no sessions key', '{"sheet":"x"}'],
    ['an empty list', '{"sessions":[]}'],
    ['a session with no title', JSON.stringify({ sessions: [{ ...session, title: ' ' }] })],
    ['a date that is not YYYY-MM-DD', JSON.stringify({ sessions: [{ ...session, localDate: '29/10/2026' }] })],
    ['a time that is not HH:MM', JSON.stringify({ sessions: [{ ...session, startTime: '7am' }] })],
    ['a session with no games', JSON.stringify({ sessions: [{ ...session, games: [] }] })],
    ['a game with no winners', JSON.stringify({ sessions: [{ ...session, games: [{ winners: [], losers: ['Bảo'] }] }] })],
    ['a blank name', JSON.stringify({ sessions: [{ ...session, games: [{ winners: ['Hiếu', ' '], losers: ['Bảo'] }] }] })],
    ['a name that is not text', JSON.stringify({ sessions: [{ ...session, games: [{ winners: [1], losers: ['Bảo'] }] }] })],
  ])('is not an import file: %s', (_label, text) => {
    expect(parseImportFile(text)).toEqual({ ok: false, problem: 'NOT_AN_IMPORT_FILE' });
  });

  it('takes 100 sessions and refuses 101', () => {
    const many = (n: number) => JSON.stringify({ sessions: Array.from({ length: n }, () => session) });
    expect(parseImportFile(many(MAX_IMPORT_SESSIONS)).ok).toBe(true);
    expect(parseImportFile(many(MAX_IMPORT_SESSIONS + 1))).toEqual({ ok: false, problem: 'TOO_MANY_SESSIONS' });
  });

  it('has a plain English line for every problem', () => {
    expect(IMPORT_FILE_PROBLEMS.NOT_JSON).toMatch(/JSON/);
    expect(IMPORT_FILE_PROBLEMS.NOT_AN_IMPORT_FILE).toMatch(/import file/);
    expect(IMPORT_FILE_PROBLEMS.TOO_MANY_SESSIONS).toMatch(/100/);
  });
});
