import { AxiosError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getErrorMessage } from './apiError';
import { getCodedErrorMessage } from './codedErrorMessage';

/** CLIENT-ERR-5: the group module's codes (A11, `ERROR_CODES.md` § group) resolve to localized copy. */
function coded(status: number, errorCode?: string, errorParams?: Record<string, unknown>): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = {
    status,
    data: { success: false, message: 'English server prose', errorCode, errorParams },
  } as AxiosResponse;
  return error;
}

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { errors: errorsEn }, vi: { errors: errorsVi } },
    ns: ['errors'],
    defaultNS: 'errors',
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  await i18next.changeLanguage('en');
});

// Every `GROUP_*` code A11 registered, with the status the backend sends it with.
const GROUP_CODES: Array<[string, number]> = [
  ['GROUP_NOT_FOUND', 404],
  ['GROUP_INVITATION_NOT_FOUND', 404],
  ['GROUP_JOIN_REQUEST_NOT_FOUND', 404],
  ['GROUP_MEMBER_NOT_FOUND', 404],
  ['GROUP_POST_NOT_FOUND', 404],
  ['GROUP_PRIVATE', 403],
  ['GROUP_ADMIN_REQUIRED', 403],
  ['GROUP_OWNER_REQUIRED', 403],
  ['GROUP_MEMBER_REQUIRED', 403],
  ['GROUP_INVITEE_ONLY', 403],
  ['GROUP_REQUESTER_ONLY', 403],
  ['GROUP_INVITER_ONLY', 403],
  ['GROUP_MEMBER_INVITES_DISABLED', 403],
  ['GROUP_NAME_TAKEN', 409],
  ['GROUP_ALREADY_MEMBER', 409],
  ['GROUP_JOIN_REQUEST_ALREADY_PENDING', 409],
  ['GROUP_INVITATION_ALREADY_PENDING', 409],
  ['GROUP_JOIN_REQUEST_NOT_PENDING', 409],
  ['GROUP_INVITATION_NOT_PENDING', 409],
  ['GROUP_POST_ALREADY_PINNED', 409],
  ['GROUP_SPORT_PROFILE_REQUIRED', 400],
  ['GROUP_NOT_FRIENDS', 400],
  ['GROUP_OWNER_CANNOT_LEAVE', 400],
  ['GROUP_OWNER_CANNOT_BE_REMOVED', 400],
  ['GROUP_OWNER_ROLE_PROTECTED', 400],
  ['GROUP_MEMBER_CAPACITY_REACHED', 400],
  ['GROUP_PIN_LIMIT_REACHED', 400],
  ['GROUP_POST_NOT_PINNABLE', 400],
  ['GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH', 400],
];

describe('group error codes', () => {
  it('covers all 29 A11 codes', () => {
    expect(GROUP_CODES).toHaveLength(29);
  });

  it.each(GROUP_CODES)('%s has en and vi copy and never falls back to the server prose', async (code, status) => {
    const params = { max: 7 };
    const en = getErrorMessage(coded(status, code, params));
    expect(en).not.toBe('English server prose');
    expect(en).not.toMatch(/^errors:|^codes\./);
    expect(getCodedErrorMessage(coded(status, code, params))).toBe(en);
    await i18next.changeLanguage('vi');
    const vi = getErrorMessage(coded(status, code, params));
    expect(vi).not.toBe(en);
    expect(vi).not.toBe('English server prose');
  });

  it('interpolates the cap and the pin limit', async () => {
    expect(getErrorMessage(coded(400, 'GROUP_MEMBER_CAPACITY_REACHED', { max: 30 }))).toBe(
      'This group is full (up to 30 members).',
    );
    expect(getErrorMessage(coded(400, 'GROUP_PIN_LIMIT_REACHED', { max: 10 }))).toBe(
      'You can pin up to 10 posts. Unpin one first.',
    );
    await i18next.changeLanguage('vi');
    expect(getErrorMessage(coded(400, 'GROUP_MEMBER_CAPACITY_REACHED', { max: 30 }))).toBe(
      'Nhóm đã đủ thành viên (tối đa 30).',
    );
  });

  it('an uncoded 403 still gets the category copy, and getCodedErrorMessage stays undefined', () => {
    expect(getErrorMessage(coded(403))).toBe("You don't have access to this.");
    expect(getCodedErrorMessage(coded(403))).toBeUndefined();
    expect(getCodedErrorMessage(coded(409, 'GROUP_NOT_A_REAL_CODE'))).toBeUndefined();
  });
});
