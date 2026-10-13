import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useReactivate } from './useReactivate';

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

describe('useReactivate', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('posts to /auth/reactivate, populates authStore and calls onSuccess', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Account reactivated',
        data: { accessToken: 'token-xyz', tokenType: 'Bearer', expiresIn: 3600, user: fixtureUser },
        timestamp: new Date().toISOString(),
      },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useReactivate({ onSuccess }), { wrapper });

    act(() => {
      result.current.reactivate({ email: 'jordan@example.com', password: 'password123' });
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('token-xyz'));
    expect(post).toHaveBeenCalledWith('/auth/reactivate', { email: 'jordan@example.com', password: 'password123' });
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ email: 'jordan@example.com' }));
  });

  it('shows the localized INVALID_CREDENTIALS copy for a wrong password, and reset clears it', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });
    const { result } = renderHook(() => useReactivate(), { wrapper });

    act(() => {
      result.current.reactivate({ email: 'jordan@example.com', password: 'wrong' });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('Invalid email or password.'));
    expect(useAuthStore.getState().accessToken).toBeNull();

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.errorMessage).toBeNull());
  });
});
