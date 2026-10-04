import { AxiosError, CanceledError, type AxiosResponse } from 'axios';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import errorsEn from '@/locales/en/errors.json';
import errorsVi from '@/locales/vi/errors.json';
import { getApiError, getErrorMessage, isPermanentError, shouldRetry } from './apiError';

function httpError(status: number, data?: unknown): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data } as AxiosResponse;
  return error;
}

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { errors: errorsEn },
      vi: { errors: errorsVi },
    },
    ns: ['errors'],
    defaultNS: 'errors',
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  await i18next.changeLanguage('en');
});

describe('getApiError', () => {
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [500, 'INTERNAL'],
    [503, 'INTERNAL'],
    [405, 'UNKNOWN'],
    [415, 'UNKNOWN'],
  ])('maps status %i to %s', (status, category) => {
    expect(getApiError(httpError(status)).category).toBe(category);
  });

  it('reads message, errorCode and errorParams from the ApiResponse envelope', () => {
    const result = getApiError(
      httpError(400, {
        success: false,
        message: 'Bio must be 50-300 characters',
        errorCode: 'USER_BIO_LENGTH',
        errorParams: { min: 50, max: 300 },
      }),
    );
    expect(result).toMatchObject({
      category: 'VALIDATION',
      status: 400,
      code: 'USER_BIO_LENGTH',
      params: { min: 50, max: 300 },
      message: 'Bio must be 50-300 characters',
      canceled: false,
    });
  });

  it('treats a plain-text body (the chat service) as status-only text', () => {
    const result = getApiError(httpError(403, 'not a member\n'));
    expect(result).toMatchObject({ category: 'FORBIDDEN', message: 'not a member' });
    expect(result.code).toBeUndefined();
  });

  it('is status-only for an empty or missing body', () => {
    expect(getApiError(httpError(500, '')).message).toBeUndefined();
    expect(getApiError(httpError(500, null)).message).toBeUndefined();
    expect(getApiError(httpError(500)).category).toBe('INTERNAL');
  });

  it('classifies a response-less axios error as NETWORK', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(getApiError(error)).toMatchObject({ category: 'NETWORK', status: null });
  });

  it('classifies a non-axios throw as UNKNOWN', () => {
    expect(getApiError(new TypeError('boom'))).toMatchObject({ category: 'UNKNOWN', status: null });
  });

  it('flags a cancelled request so it is never shown', () => {
    expect(getApiError(new CanceledError()).canceled).toBe(true);
  });
});

describe('shouldRetry / isPermanentError', () => {
  it.each([401, 403, 404, 400, 409])('never retries a %i', (status) => {
    expect(isPermanentError(httpError(status))).toBe(true);
    expect(shouldRetry(0, httpError(status))).toBe(false);
  });

  it('retries a 5xx, a network failure and an unknown error up to three times', () => {
    for (const error of [httpError(500), new AxiosError('Network Error', 'ERR_NETWORK'), new Error('x')]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(true);
      expect(shouldRetry(3, error)).toBe(false);
    }
  });
});

describe('getErrorMessage', () => {
  it('shows the server text for a validation failure', () => {
    expect(getErrorMessage(httpError(400, { message: 'gender must be one of: MALE, FEMALE' }))).toBe(
      'gender must be one of: MALE, FEMALE',
    );
  });

  it('shows the server text for a conflict and for a 401 on login', () => {
    expect(getErrorMessage(httpError(409, { message: 'Already a member' }))).toBe('Already a member');
    expect(getErrorMessage(httpError(401, { message: 'Invalid email or password' }))).toBe(
      'Invalid email or password',
    );
  });

  it('falls back to the category copy when a validation failure has no text', () => {
    expect(getErrorMessage(httpError(400))).toBe(errorsEn.category.VALIDATION);
  });

  it('always uses the category copy for 403, 404 and 5xx, never the English server text', async () => {
    await i18next.changeLanguage('vi');
    expect(getErrorMessage(httpError(403, { message: 'Access denied' }))).toBe(errorsVi.category.FORBIDDEN);
    expect(getErrorMessage(httpError(404, { message: 'Resource not found' }))).toBe(errorsVi.category.NOT_FOUND);
    expect(getErrorMessage(httpError(500, { message: 'An unexpected error occurred' }))).toBe(
      errorsVi.category.INTERNAL,
    );
  });

  it('uses the NETWORK copy when there is no response', () => {
    expect(getErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(errorsEn.category.NETWORK);
  });

  it('prefers an errors:codes entry over everything, interpolating params', () => {
    i18next.addResourceBundle('en', 'errors', { codes: { TEST_RANGE: 'Between {{min}} and {{max}}' } }, true, true);
    try {
      expect(
        getErrorMessage(httpError(403, { message: 'x', errorCode: 'TEST_RANGE', errorParams: { min: 1, max: 9 } })),
      ).toBe('Between 1 and 9');
    } finally {
      i18next.removeResourceBundle('en', 'errors');
      i18next.addResourceBundle('en', 'errors', errorsEn);
    }
  });

  it('ignores an errorCode the client has no copy for', () => {
    expect(getErrorMessage(httpError(404, { message: 'Gone', errorCode: 'NO_SUCH_CODE' }))).toBe(
      errorsEn.category.NOT_FOUND,
    );
  });
});
