import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useEmailChangeCode } from './useEmailChangeCode';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const sent = { data: { success: true, message: 'ok', data: { resendAfterSeconds: 60, expiresInSeconds: 900 }, timestamp: '' } };

function rejection(status: number, errorCode: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'x', errorCode, errorParams } } };
}

describe('useEmailChangeCode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the trimmed address, opens the code step and starts the countdown from the response', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });

    act(() => result.current.send('  new@example.com '));

    await waitFor(() => expect(result.current.hasSent).toBe(true));
    expect(post).toHaveBeenCalledWith('/users/me/email-change-code', { newEmail: 'new@example.com' });
    expect(result.current.resendSecondsLeft).toBe(60);
    expect(result.current.expiresInSeconds).toBe(900);
  });

  it('closes the code step on an edit but keeps the countdown running (the lock is per user, not per address)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });
    act(() => result.current.send('new@example.com'));
    await waitFor(() => expect(result.current.hasSent).toBe(true));

    act(() => result.current.closeCodeStep());

    expect(result.current.hasSent).toBe(false);
    expect(result.current.resendSecondsLeft).toBe(60);
  });

  it('shows a refusal of the address as its localized line and starts no countdown', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(409, 'EMAIL_ALREADY_REGISTERED'));
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });

    act(() => result.current.send('taken@example.com'));

    await waitFor(() => expect(result.current.errorCode).toBe('EMAIL_ALREADY_REGISTERED'));
    expect(result.current.errorMessage).toBe('An account with this email already exists. Use another address.');
    expect(result.current.hasSent).toBe(false);
    expect(result.current.resendSecondsLeft).toBe(0);
  });

  it('answers the resend lock quietly: the countdown restarts from the seconds left, no line, no code step', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(429, 'VERIFICATION_RESEND_TOO_SOON', { seconds: 42 }));
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });

    act(() => result.current.send('other@example.com'));

    await waitFor(() => expect(result.current.resendSecondsLeft).toBe(42));
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(result.current.hasSent).toBe(false);
  });

  it('tells the daily limit in words and starts no countdown', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(429, 'NEW_EMAIL_CODE_LIMIT_REACHED', { seconds: 43200 }));
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });

    act(() => result.current.send('other@example.com'));

    await waitFor(() => expect(result.current.errorMessage).toBe('You’ve requested too many codes today. Try again tomorrow.'));
    expect(result.current.resendSecondsLeft).toBe(0);
  });

  it('answers a 503 with the shared try-again-later line and starts no countdown', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(503, 'SERVICE_UNAVAILABLE'));
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });

    act(() => result.current.send('other@example.com'));

    await waitFor(() => expect(result.current.errorMessage).toBe('This service isn’t available right now. Try again later.'));
    expect(result.current.resendSecondsLeft).toBe(0);
    expect(result.current.hasSent).toBe(false);
  });

  it('reset clears the code step, the error and the countdown', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(sent);
    const { result } = renderHook(() => useEmailChangeCode(), { wrapper });
    act(() => result.current.send('new@example.com'));
    await waitFor(() => expect(result.current.hasSent).toBe(true));

    act(() => result.current.reset());

    expect(result.current.hasSent).toBe(false);
    expect(result.current.resendSecondsLeft).toBe(0);
  });
});
