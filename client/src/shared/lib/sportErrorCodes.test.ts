import { AxiosError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getErrorMessage } from './apiError';
import { getCodedErrorMessage } from './codedErrorMessage';

/** CLIENT-ERR-4: the sport module's codes (A25) resolve to localized copy with `errorParams` filled in. */
function coded(status: number, errorCode?: string, errorParams?: Record<string, unknown>): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = {
    status,
    data: { success: false, message: 'English server prose (4KB)', errorCode, errorParams },
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

const GENERIC_EN = "Couldn't save your sport details. Please try again.";
const GENERIC_VI = 'Không thể lưu thông tin môn thể thao. Vui lòng thử lại.';

describe('sport error codes', () => {
  it.each([
    [409, 'SPORT_PROFILE_ALREADY_EXISTS', { sportName: 'Badminton' }, 'You already have a Badminton profile.', 'Bạn đã có hồ sơ Badminton rồi.'],
    [400, 'PROFILE_NOT_RESUMABLE', { sportName: 'Badminton' }, "There's no deactivated Badminton profile to bring back.", 'Không có hồ sơ Badminton đã tắt để kích hoạt lại.'],
    [403, 'SPORT_PROFILE_NOT_OWNED', undefined, 'You can only change your own sport profile.', 'Bạn chỉ có thể thay đổi hồ sơ môn thể thao của chính mình.'],
    [404, 'SPORT_PROFILE_NOT_FOUND', undefined, 'This sport profile no longer exists.', 'Hồ sơ môn thể thao này không còn tồn tại.'],
    [404, 'SPORT_NOT_FOUND', undefined, "This sport isn't available right now.", 'Môn thể thao này hiện không khả dụng.'],
  ])('%i %s resolves to en and vi copy, never the server prose', async (status, code, params, en, vi) => {
    expect(getErrorMessage(coded(status, code, params))).toBe(en);
    expect(getCodedErrorMessage(coded(status, code, params))).toBe(en);
    await i18next.changeLanguage('vi');
    expect(getErrorMessage(coded(status, code, params))).toBe(vi);
  });

  it('the attribute-size errors show the generic line, without the 4 KB limit or the server prose', async () => {
    for (const code of ['PROFILE_ATTRIBUTES_TOO_LARGE', 'PROFILE_ATTRIBUTES_INVALID']) {
      const text = getErrorMessage(coded(400, code, { maxBytes: 4096 }));
      expect(text).toBe(GENERIC_EN);
      expect(text).not.toMatch(/4096|4KB|KB/);
    }
    await i18next.changeLanguage('vi');
    expect(getErrorMessage(coded(400, 'PROFILE_ATTRIBUTES_TOO_LARGE', { maxBytes: 4096 }))).toBe(GENERIC_VI);
  });

  it('has copy for every code A25 delivers', () => {
    for (const code of [
      'SPORT_PROFILE_ALREADY_EXISTS', 'PROFILE_NOT_RESUMABLE', 'PROFILE_ATTRIBUTES_TOO_LARGE',
      'PROFILE_ATTRIBUTES_INVALID', 'SPORT_PROFILE_NOT_OWNED', 'SPORT_PROFILE_NOT_FOUND', 'SPORT_NOT_FOUND',
    ]) {
      expect(errorsEn.codes, code).toHaveProperty(code);
      expect(errorsVi.codes, code).toHaveProperty(code);
    }
  });

  it('getCodedErrorMessage is undefined for an uncoded or unknown-code failure, so screens keep their own line', () => {
    expect(getCodedErrorMessage(coded(400))).toBeUndefined();
    expect(getCodedErrorMessage(coded(409, 'SOME_FUTURE_CODE'))).toBeUndefined();
    expect(getCodedErrorMessage(new Error('boom'))).toBeUndefined();
  });
});
