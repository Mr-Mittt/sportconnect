import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useResetTokenCheck } from './useResetTokenCheck';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function failure(status: number, errorCode?: string): AxiosError {
  const response = {
    status,
    data: { success: false, message: 'x', ...(errorCode ? { errorCode } : {}), data: null, timestamp: '' },
  } as AxiosResponse;
  return new AxiosError('failed', String(status), undefined, undefined, response);
}

describe('useResetTokenCheck', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the token in the body and reports a usable link', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { success: true, data: null } });
    const { result } = renderHook(() => useResetTokenCheck('abc'), { wrapper });
    expect(result.current.isChecking).toBe(true);
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(post).toHaveBeenCalledWith('/auth/reset-password/validate', { token: 'abc' });
    expect(result.current.isLinkInvalid).toBe(false);
  });

  it('reports an invalid link on 404 RESET_TOKEN_INVALID', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(failure(404, 'RESET_TOKEN_INVALID'));
    const { result } = renderHook(() => useResetTokenCheck('abc'), { wrapper });
    await waitFor(() => expect(result.current.isLinkInvalid).toBe(true));
    expect(result.current.isChecking).toBe(false);
  });

  it('does not call the server without a token', () => {
    const post = vi.spyOn(apiClient, 'post');
    const { result } = renderHook(() => useResetTokenCheck(null), { wrapper });
    expect(post).not.toHaveBeenCalled();
    expect(result.current).toEqual({ isChecking: false, isLinkInvalid: false });
  });

  it('does not call a 5xx failure an invalid link, so the form stays usable', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(failure(500));
    const { result } = renderHook(() => useResetTokenCheck('abc'), { wrapper });
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.isLinkInvalid).toBe(false);
  });
});
