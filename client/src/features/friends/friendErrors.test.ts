import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showErrorToast = vi.fn();
vi.mock('@/shared/lib/errorToast', () => ({ showErrorToast: (error: unknown) => showErrorToast(error) }));

import { reportFriendMutationError } from './friendErrors';

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'x', errorCode, data: null } } as AxiosResponse;
  return error;
}

describe('reportFriendMutationError (CLIENT-ERR-9)', () => {
  beforeEach(() => showErrorToast.mockReset());

  it.each(['ALREADY_FRIENDS', 'FRIEND_REQUEST_ALREADY_PENDING', 'FRIEND_REQUEST_NOT_FOUND'])(
    'says nothing for the stale state %s',
    (code) => {
      reportFriendMutationError(coded(code === 'FRIEND_REQUEST_NOT_FOUND' ? 404 : 409, code));
      expect(showErrorToast).not.toHaveBeenCalled();
    },
  );

  it('keeps the toast for any other failure', () => {
    const error = coded(500, 'SOMETHING_ELSE');
    reportFriendMutationError(error);
    expect(showErrorToast).toHaveBeenCalledWith(error);
  });
});
