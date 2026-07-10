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

describe('useLogout', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    vi.restoreAllMocks();
  });

  it('clears the session on a successful logout call', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Logged out successfully', data: null, timestamp: new Date().toISOString() },
    });

    const onSettled = vi.fn();
    const { result } = renderHook(() => useLogout({ onSettled }), { wrapper });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('clears the session even when the network call fails', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const onSettled = vi.fn();
    const { result } = renderHook(() => useLogout({ onSettled }), { wrapper });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
