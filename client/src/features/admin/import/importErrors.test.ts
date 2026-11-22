import { describe, expect, it } from 'vitest';
import { describeImportError } from './importErrors';

function failure(status: number, errorCode?: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'English server text', errorCode, errorParams } } };
}

describe('describeImportError (CLIENT-ADMIN-IMPORT-1)', () => {
  it('names the names that still need a member', () => {
    expect(describeImportError(failure(409, 'SESSION_IMPORT_UNRESOLVED_NAMES', { names: ['Ánh', 'Anh_VL'] })))
      .toBe('These names still need a member: Ánh, Anh_VL.');
  });

  it.each([
    ['REQUEST_INCOMPLETE', {}, 'Group id and location id are both needed.'],
    ['SESSION_COUNT', { max: 100 }, 'A call takes between 1 and 100 sessions.'],
    ['LOCATION_TIMEZONE', {}, "That location has no timezone, so the times can't be read."],
    ['SESSION_INCOMPLETE', { title: 'T' }, '"T" is missing its date or times.'],
    ['END_NOT_AFTER_START', { title: 'T' }, '"T" ends before it starts.'],
    ['GAME_COUNT', { title: 'T', max: 50 }, '"T" has no games, or more than the sport allows (50).'],
    ['SIDE_SIZE', { title: 'T', game: 3, max: 2 }, 'Game 3 of "T" has a side with no players or too many (at most 2).'],
    ['NAME_BLANK', { title: 'T', game: 3 }, 'Game 3 of "T" has an empty name.'],
    ['DUPLICATE_PLAYER', { title: 'T', game: 3 }, 'Game 3 of "T" has the same member twice.'],
  ])('SESSION_IMPORT_INVALID, reason %s', (reason, params, expected) => {
    expect(describeImportError(failure(400, 'SESSION_IMPORT_INVALID', { reason, ...params }))).toBe(expected);
  });

  it('has a line for an invalid request whose reason it does not know', () => {
    expect(describeImportError(failure(400, 'SESSION_IMPORT_INVALID', { reason: 'SOMETHING_NEW' }))).toBe('The import request is not valid.');
  });

  it.each([
    ['SESSION_IMPORT_HOST_NOT_MEMBER', undefined, 400, "The group's owner is not an active member, so they can't host the sessions."],
    ['SESSION_IMPORT_ALIAS_NOT_MEMBER', { name: 'Ánh' }, 400, 'The member chosen for "Ánh" is not an active member of the group.'],
    ['SESSION_IMPORT_NOT_FINISHED', { title: 'T' }, 400, '"T" has not ended yet. Only finished sessions can be imported.'],
    ['GROUP_NOT_FOUND', undefined, 404, 'No active group has that id.'],
    ['SESSION_LOCATION_SPORT_MISMATCH', undefined, 400, "That location is for a different sport than the group's."],
    ['SESSION_SPORT_REQUIRED', undefined, 400, "That group has no sport, so sessions can't be imported into it."],
  ])('%s', (code, params, status, expected) => {
    expect(describeImportError(failure(status, code, params))).toBe(expected);
  });

  it('never shows the server text', () => {
    expect(describeImportError(failure(500))).not.toContain('English server text');
    expect(describeImportError(failure(400, 'SESSION_IMPORT_INVALID', { reason: 'GAME_COUNT', title: 'T' }))).not.toContain('English server text');
  });

  it('says only an admin can import on a 403, and a network failure on no response', () => {
    expect(describeImportError(failure(403))).toBe('Only an admin can import sessions.');
    expect(describeImportError({ isAxiosError: true })).toBe("Couldn't reach the server. Check the connection and try again.");
  });

  it('falls back to one generic line', () => {
    expect(describeImportError(failure(500))).toBe('Something went wrong. Please try again.');
    expect(describeImportError(new Error('x'))).toBe('Something went wrong. Please try again.');
  });
});
