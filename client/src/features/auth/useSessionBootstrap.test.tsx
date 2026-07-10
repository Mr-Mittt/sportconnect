import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useSessionBootstrap } from './useSessionBootstrap';

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

describe('useSessionBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
    vi.restoreAllMocks();
  });

  it('restores the session on a valid refresh cookie', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: 'token-abc',
          tokenType: 'Bearer',
          expiresIn: 3600,
          user: fixtureUser,
        },
        timestamp: new Date().toISOString(),
      },
    });

    renderHook(() => useSessionBootstrap(), { wrapper });

    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false));
    expect(useAuthStore.getState().accessToken).toBe('token-abc');
    expect(useAuthStore.getState().user?.email).toBe('jordan@example.com');
    expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh');
  });

  it('leaves the session unauthenticated on a missing/expired cookie, without a visible error', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Refresh token missing',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    renderHook(() => useSessionBootstrap(), { wrapper });

    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false));
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('calls /auth/refresh exactly once even under a duplicate mount (StrictMode double-invoke guard)', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('no session'));

    const { rerender } = renderHook(() => useSessionBootstrap(), { wrapper });
    rerender();
    rerender();

    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
