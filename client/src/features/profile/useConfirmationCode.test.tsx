import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useConfirmationCode } from './useConfirmationCode';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const sent = { data: { success: true, message: 'ok', data: { resendAfterSeconds: 60, expiresInSeconds: 900 }, timestamp: '' } };

function rejection(status: number, errorCode: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'x', errorCode, errorParams } } };
}

describe('useConfirmationCode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('posts the purpose, then counts the 60 s down and allows Resend at zero', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useConfirmationCode('DEACTIVATE'), { wrapper });
    expect(result.current.hasSent).toBe(false);

    act(() => result.current.send());

    await waitFor(() => expect(result.current.hasSent).toBe(true));
    expect(post).toHaveBeenCalledWith('/users/me/confirmation-code', { purpose: 'DEACTIVATE' });
    expect(result.current.resendSecondsLeft).toBe(60);
    expect(result.current.expiresInSeconds).toBe(900);

    act(() => vi.advanceTimersByTime(45_000));
    await waitFor(() => expect(result.current.resendSecondsLeft).toBe(15));
    act(() => vi.advanceTimersByTime(15_000));
    await waitFor(() => expect(result.current.resendSecondsLeft).toBe(0));
  });

  it('takes the countdown length from the response, not from a constant', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'ok', data: { resendAfterSeconds: 30, expiresInSeconds: 600 }, timestamp: '' },
    });
    const { result } = renderHook(() => useConfirmationCode('CHANGE_PASSWORD'), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.resendSecondsLeft).toBe(30));
    expect(result.current.expiresInSeconds).toBe(600);
  });

  it('restarts the countdown from errorParams.seconds on VERIFICATION_RESEND_TOO_SOON, quietly', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(429, 'VERIFICATION_RESEND_TOO_SOON', { seconds: 23 }));
    const { result } = renderHook(() => useConfirmationCode('DEACTIVATE'), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.hasSent).toBe(true));
    expect(result.current.resendSecondsLeft).toBe(23);
    expect(result.current.errorMessage).toBeNull();
  });

  it('shows the localized line for a failed send and stays unsent', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(400, 'VERIFICATION_EMAIL_UNAVAILABLE'));
    const { result } = renderHook(() => useConfirmationCode('DEACTIVATE'), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.errorMessage).toBe('Your account has no email address, so a code can’t be sent.'));
    expect(result.current.hasSent).toBe(false);
  });

  it('reset forgets the sent code and the countdown', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useConfirmationCode('DEACTIVATE'), { wrapper });
    act(() => result.current.send());
    await waitFor(() => expect(result.current.hasSent).toBe(true));

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.hasSent).toBe(false));
    expect(result.current.resendSecondsLeft).toBe(0);
  });
});
