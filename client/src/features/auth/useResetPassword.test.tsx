import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { isResetLinkErrorCode, useResetPassword } from './useResetPassword';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiFailure(status: number, errorCode: string): AxiosError {
  const response = {
    status,
    data: { success: false, message: 'x', errorCode, data: null, timestamp: '' },
  } as AxiosResponse;
  return new AxiosError('failed', String(status), undefined, undefined, response);
}

describe('useResetPassword', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts token and password and calls onSuccess', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { success: true, data: null } });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useResetPassword({ onSuccess }), { wrapper });
    act(() => result.current.resetPassword({ token: 'abc', newPassword: 'newpassword1' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/auth/reset-password', { token: 'abc', newPassword: 'newpassword1' });
  });

  it.each([
    [404, 'RESET_TOKEN_INVALID'],
    [400, 'RESET_TOKEN_USED'],
    [400, 'RESET_TOKEN_EXPIRED'],
  ])('exposes %s %s as errorCode', async (status, code) => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(apiFailure(status, code));
    const { result } = renderHook(() => useResetPassword(), { wrapper });
    act(() => result.current.resetPassword({ token: 'abc', newPassword: 'newpassword1' }));
    await waitFor(() => expect(result.current.errorCode).toBe(code));
    expect(isResetLinkErrorCode(result.current.errorCode)).toBe(true);
  });

  it('does not treat a validation failure as a dead link', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(apiFailure(400, 'VALIDATION_FAILED'));
    const { result } = renderHook(() => useResetPassword(), { wrapper });
    act(() => result.current.resetPassword({ token: 'abc', newPassword: 'newpassword1' }));
    await waitFor(() => expect(result.current.errorCode).toBe('VALIDATION_FAILED'));
    expect(isResetLinkErrorCode(result.current.errorCode)).toBe(false);
  });
});
