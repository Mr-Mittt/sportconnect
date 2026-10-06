import { AxiosError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getErrorMessage } from './apiError';
import { getCodedErrorMessage } from './codedErrorMessage';

/** CLIENT-ERR-6: the post module's codes (A18, `ERROR_CODES.md` § post) resolve to localized copy. */
function coded(status: number, errorCode?: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = {
    status,
    data: { success: false, message: 'English server prose', errorCode },
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

// Every `POST_*` / `COMMENT_*` code A18 registered, with the status the backend sends it with.
const POST_CODES: Array<[string, number]> = [
  ['POST_NOT_FOUND', 404],
  ['POST_FORBIDDEN', 403],
  ['POST_GROUP_MEMBER_REQUIRED', 403],
  ['POST_BROADCAST_ADMIN_REQUIRED', 403],
  ['POST_EDIT_FORBIDDEN', 403],
  ['POST_DELETE_FORBIDDEN', 403],
  ['POST_TYPE_NOT_CREATABLE', 400],
  ['POST_TYPE_NOT_EDITABLE', 400],
  ['POST_TYPE_NOT_DELETABLE', 400],
  ['POST_GROUP_NOT_ALLOWED', 400],
  ['POST_GROUP_ID_REQUIRED', 400],
  ['POST_BROADCAST_ALREADY_ACTIVE', 409],
  ['POST_BROADCAST_END_TIME_PAST', 400],
  ['POST_NOT_BROADCAST', 400],
  ['POST_ALREADY_LIKED', 409],
  ['POST_NOT_LIKED', 409],
  ['COMMENT_NOT_FOUND', 404],
  ['COMMENT_PARENT_NOT_FOUND', 404],
  ['COMMENT_SYSTEM_READONLY', 400],
  ['COMMENT_DELETE_FORBIDDEN', 403],
  ['COMMENT_ALREADY_LIKED', 409],
  ['COMMENT_NOT_LIKED', 409],
];

describe('post error codes', () => {
  it('covers all 22 A18 codes', () => {
    expect(POST_CODES).toHaveLength(22);
  });

  it.each(POST_CODES)('%s has en and vi copy and never falls back to the server prose', async (code, status) => {
    const en = getErrorMessage(coded(status, code));
    expect(en).not.toBe('English server prose');
    expect(en).not.toMatch(/^errors:|^codes\./);
    expect(getCodedErrorMessage(coded(status, code))).toBe(en);
    await i18next.changeLanguage('vi');
    const vi = getErrorMessage(coded(status, code));
    expect(vi).not.toBe(en);
    expect(vi).not.toBe('English server prose');
  });

  it('an unknown POST_ code falls back to category copy, and getCodedErrorMessage stays undefined', () => {
    expect(getCodedErrorMessage(coded(404, 'POST_NOT_A_REAL_CODE'))).toBeUndefined();
    expect(getErrorMessage(coded(404, 'POST_NOT_A_REAL_CODE'))).not.toBe('English server prose');
  });
});
