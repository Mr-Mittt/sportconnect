import { AxiosError, CanceledError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldRetry } from '@/shared/lib/apiError';
import { createAppQueryClient, handleMutationError } from './queryClient';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

function httpError(status: number, data?: unknown): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data } as AxiosResponse;
  return error;
}

beforeEach(() => {
  toastError.mockReset();
});

describe('handleMutationError', () => {
  it('toasts a failure by default, with the localized category copy', () => {
    handleMutationError(httpError(500, { message: 'An unexpected error occurred' }), undefined);

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe('Something went wrong on our side. Try again.');
  });

  it('shows the server text for a 400 (validation) instead of the generic copy', () => {
    handleMutationError(httpError(400, { message: 'gender must be one of: MALE, FEMALE' }), undefined);

    expect(toastError.mock.calls[0][0]).toBe('gender must be one of: MALE, FEMALE');
  });

  it('uses the offline copy when there was no response', () => {
    handleMutationError(new AxiosError('Network Error', 'ERR_NETWORK'), undefined);

    expect(toastError.mock.calls[0][0]).toBe("Can't reach the server. Check your connection.");
  });

  it('stays silent when the mutation declares an inline error UI', () => {
    handleMutationError(httpError(500), { errorDisplay: 'inline' });

    expect(toastError).not.toHaveBeenCalled();
  });

  it('stays silent for a background mutation', () => {
    handleMutationError(httpError(500), { errorDisplay: 'silent' });

    expect(toastError).not.toHaveBeenCalled();
  });

  it('never toasts a 401 (the silent-refresh flow owns it) or a cancelled request', () => {
    handleMutationError(httpError(401), undefined);
    handleMutationError(new CanceledError(), undefined);

    expect(toastError).not.toHaveBeenCalled();
  });

  it('dedupes the same failure by using the message as the toast id', () => {
    handleMutationError(httpError(500), undefined);

    expect(toastError.mock.calls[0][1]).toEqual({ id: toastError.mock.calls[0][0] });
  });
});

describe('createAppQueryClient', () => {
  it('uses the category-based retry rule as the query default', () => {
    const client = createAppQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });

  it('routes a failing mutation through the global handler', async () => {
    const client = createAppQueryClient();

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(httpError(403)) })
      .execute(undefined)
      .catch(() => undefined);

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toBe("You don't have access to this.");
  });

  it('does not toast a failing mutation that opted out through meta', async () => {
    const client = createAppQueryClient();

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(httpError(500)), meta: { errorDisplay: 'inline' } })
      .execute(undefined)
      .catch(() => undefined);

    expect(toastError).not.toHaveBeenCalled();
  });
});
