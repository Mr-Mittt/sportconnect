import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useLogout } from './useLogout';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const fixtureUser = {
  id: '1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

const ok = {
  data: { success: true, message: 'Logged out successfully', data: null, timestamp: new Date().toISOString() },
};

describe('useLogout', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    vi.restoreAllMocks();
  });

  it('clears the session and signals the caller on a successful logout call', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(ok);

    const onSignedOut = vi.fn();
    const { result } = renderHook(() => useLogout({ onSignedOut }), { wrapper });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it('clears the session even when the call fails for a reason other than 503 (network, 401)', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const onSignedOut = vi.fn();
    const { result } = renderHook(() => useLogout({ onSignedOut }), { wrapper });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it('keeps the session and reports failed on a 503, and retry can still sign out', async () => {
    vi.spyOn(apiClient, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503, data: { success: false, errorCode: 'SERVICE_UNAVAILABLE' } },
      })
      .mockResolvedValueOnce(ok);

    const onSignedOut = vi.fn();
    const { result } = renderHook(() => useLogout({ onSignedOut }), { wrapper });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('token-abc');
    expect(onSignedOut).not.toHaveBeenCalled();

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it('dismissFailure ("Stay signed in") clears the failed flag and keeps the session', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { success: false } },
    });
    const { result } = renderHook(() => useLogout(), { wrapper });

    act(() => {
      result.current.logout();
    });
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.dismissFailure());

    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(useAuthStore.getState().user).not.toBeNull();
  });
});
