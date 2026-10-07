import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showErrorToast } from '@/shared/lib/errorToast';
import { reportLocationMutationError } from './locationErrors';

vi.mock('@/shared/lib/errorToast', () => ({ showErrorToast: vi.fn() }));

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'x', errorCode, data: null } } as AxiosResponse;
  return error;
}

describe('reportLocationMutationError', () => {
  beforeEach(() => vi.mocked(showErrorToast).mockClear());

  it.each(['LOCATION_ALREADY_FAVORITED', 'LOCATION_NOT_FAVORITED'])('says nothing for the stale state %s', (code) => {
    reportLocationMutationError(coded(409, code));
    expect(showErrorToast).not.toHaveBeenCalled();
  });

  it.each([
    coded(404, 'LOCATION_NOT_FOUND'),
    coded(400, 'LOCATION_SPORT_PROFILE_REQUIRED'),
    coded(500, 'INTERNAL_ERROR'),
    new Error('network error'),
  ])('toasts every other failure', (error) => {
    reportLocationMutationError(error);
    expect(showErrorToast).toHaveBeenCalledWith(error);
  });
});
