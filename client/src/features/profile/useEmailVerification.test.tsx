import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useEmailVerification } from './useEmailVerification';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

function reply(data: { alreadyVerified: boolean; resendAfterSeconds: number }) {
  return { data: { success: true, message: 'ok', data, timestamp: '' } };
}

function rejection(status: number, errorCode: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'x', errorCode, errorParams } } };
}

describe('useEmailVerification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts without a body, then counts down the resend lock from the response', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(reply({ alreadyVerified: false, resendAfterSeconds: 60 }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.hasSent).toBe(true));
    expect(post).toHaveBeenCalledWith('/users/me/email-verification');
    expect(result.current.resendSecondsLeft).toBe(60);
  });

  it('reads the profile again when the account turns out to be verified already, and sends nothing', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(reply({ alreadyVerified: true, resendAfterSeconds: 0 }));
    const { wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(result.current.hasSent).toBe(false);
    expect(result.current.resendSecondsLeft).toBe(0);
  });

  it('restarts the countdown without an error line when a mail was just sent', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(429, 'VERIFICATION_RESEND_TOO_SOON', { seconds: 30 }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.resendSecondsLeft).toBe(30));
    expect(result.current.errorMessage).toBeNull();
  });

  it('uses its own wording for an account with no address, not the code copy', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(400, 'VERIFICATION_EMAIL_UNAVAILABLE'));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Your account has no email address, so a verification email can’t be sent.'),
    );
  });

  it('answers a 503 with the shared try-again-later line', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(503, 'SERVICE_UNAVAILABLE'));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.errorMessage).toBe('This service isn’t available right now. Try again later.'));
    expect(result.current.resendSecondsLeft).toBe(0);
  });

  it('answers any other failure with a generic line of its own', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(rejection(404, 'USER_NOT_FOUND'));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEmailVerification(), { wrapper });

    act(() => result.current.send());

    await waitFor(() => expect(result.current.errorMessage).toBe('Couldn’t send the verification email. Try again.'));
  });
});
