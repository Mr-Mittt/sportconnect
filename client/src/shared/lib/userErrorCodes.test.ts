import { AxiosError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getErrorMessage } from './apiError';

/** CLIENT-ERR-3: the user module's codes (U21) resolve to localized copy with `errorParams` filled in. */
function coded(status: number, errorCode: string, errorParams?: Record<string, unknown>): AxiosError {
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

describe('user error codes', () => {
  it.each([
    [400, 'HEIGHT_OUT_OF_RANGE', { min: 50, max: 300 }, 'Height must be between 50 and 300 cm.', 'Chiều cao phải từ 50 đến 300 cm.'],
    [400, 'WEIGHT_OUT_OF_RANGE', { min: 20, max: 300 }, 'Weight must be between 20 and 300 kg.', 'Cân nặng phải từ 20 đến 300 kg.'],
    [400, 'SHOE_SIZE_OUT_OF_RANGE', { min: 10, max: 500 }, 'Shoe size must be between 10 and 500 mm.', 'Cỡ giày phải từ 10 đến 500 mm.'],
    [400, 'SEARCH_KEYWORD_TOO_SHORT', { min: 2 }, 'Type at least 2 characters to search.', 'Nhập ít nhất 2 ký tự để tìm kiếm.'],
    [409, 'ALREADY_FRIENDS', undefined, 'You’re already friends.', 'Hai bạn đã là bạn bè.'],
    [409, 'NOT_FRIENDS', undefined, 'You’re no longer friends with this person.', 'Bạn và người này không còn là bạn bè.'],
    [404, 'FRIEND_REQUEST_NOT_FOUND', undefined, 'This friend request no longer exists.', 'Lời mời kết bạn này không còn tồn tại.'],
    [404, 'USER_NOT_FOUND', undefined, 'This person is no longer available.', 'Người này hiện không còn khả dụng.'],
    [403, 'USER_PROFILE_NOT_OWNED', undefined, 'You can only edit your own profile.', 'Bạn chỉ có thể chỉnh sửa hồ sơ của chính mình.'],
  ])('%i %s resolves to en and vi copy, never the server prose', async (status, code, params, en, vi) => {
    expect(getErrorMessage(coded(status, code, params))).toBe(en);
    await i18next.changeLanguage('vi');
    expect(getErrorMessage(coded(status, code, params))).toBe(vi);
  });

  it('has copy for every code U21 delivers', () => {
    const delivered = [
      'USER_PROFILE_NOT_OWNED', 'HEIGHT_OUT_OF_RANGE', 'WEIGHT_OUT_OF_RANGE', 'SHOE_SIZE_OUT_OF_RANGE',
      'GENDER_INVALID', 'LANGUAGE_UNKNOWN', 'LOCATION_INCOMPLETE', 'LOCATION_OUT_OF_RANGE',
      'CURRENT_PASSWORD_INCORRECT', 'SEARCH_KEYWORD_TOO_SHORT', 'FRIEND_REQUEST_SELF', 'USER_NOT_FOUND',
      'FRIEND_REQUEST_NOT_FOUND', 'ALREADY_FRIENDS', 'FRIEND_REQUEST_ALREADY_PENDING',
      'FRIEND_REQUEST_NOT_PENDING', 'NOT_FRIENDS',
    ];
    for (const code of delivered) {
      expect(errorsEn.codes, code).toHaveProperty(code);
      expect(errorsVi.codes, code).toHaveProperty(code);
    }
  });

  it('an unknown code falls back to the server prose for a validation error', () => {
    expect(getErrorMessage(coded(400, 'SOMETHING_NEW'))).toBe('English server prose');
  });
});
