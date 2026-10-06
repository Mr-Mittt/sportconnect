import { AxiosError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getErrorMessage } from './apiError';
import { getCodedErrorMessage } from './codedErrorMessage';

/** CLIENT-ERR-7: the session module's codes (SESSION-45, `ERROR_CODES.md` § session) resolve to localized copy. */
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

const SESSION_CODES: Array<[string, number]> = [
  ['SESSION_NOT_FOUND', 404],
  ['SESSION_JOIN_REQUEST_NOT_FOUND', 404],
  ['SESSION_FORBIDDEN', 403],
  ['SESSION_GROUP_MEMBER_REQUIRED', 403],
  ['SESSION_GROUP_ADMIN_REQUIRED', 403],
  ['SESSION_CREATOR_REQUIRED', 403],
  ['SESSION_CANCELLED', 409],
  ['SESSION_NOT_CANCELLABLE', 409],
  ['SESSION_NOT_PREPARING', 409],
  ['SESSION_NOT_PARTICIPANT', 409],
  ['SESSION_CREATOR_CANNOT_LEAVE', 400],
  ['SESSION_SPORT_REQUIRED', 400],
  ['SESSION_LOCATION_SPORT_MISMATCH', 400],
  ['SESSION_FEE_AMOUNT_REQUIRED', 400],
];

describe('session error codes (SESSION-45)', () => {
  it('covers all 14 SESSION-45 codes', () => {
    expect(SESSION_CODES).toHaveLength(14);
  });

  it.each(SESSION_CODES)('%s has en and vi copy and never falls back to the server prose', async (code, status) => {
    const en = getErrorMessage(coded(status, code));
    expect(en).not.toBe('English server prose');
    expect(en).not.toMatch(/^errors:|^codes\./);
    expect(getCodedErrorMessage(coded(status, code))).toBe(en);
    await i18next.changeLanguage('vi');
    const vi = getErrorMessage(coded(status, code));
    expect(vi).not.toBe(en);
    expect(vi).not.toBe('English server prose');
  });

  it('SESSION_NOT_CANCELLABLE ignores its raw status param (same copy for COMPLETED and CANCELLED)', () => {
    expect(getErrorMessage(coded(409, 'SESSION_NOT_CANCELLABLE', { status: 'COMPLETED' }))).toBe(
      getErrorMessage(coded(409, 'SESSION_NOT_CANCELLABLE', { status: 'CANCELLED' })),
    );
  });

  it('an unknown SESSION_ code falls back to category copy, and getCodedErrorMessage stays undefined', () => {
    expect(getCodedErrorMessage(coded(404, 'SESSION_NOT_A_REAL_CODE'))).toBeUndefined();
    expect(getErrorMessage(coded(404, 'SESSION_NOT_A_REAL_CODE'))).not.toBe('English server prose');
  });
});
