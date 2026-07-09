import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useRegister } from './useRegister';

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

describe('useRegister', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('populates authStore and calls onSuccess on a successful registration', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'User registered successfully',
        data: {
          accessToken: 'token-abc',
          tokenType: 'Bearer',
          expiresIn: 3600,
          user: fixtureUser,
        },
        timestamp: new Date().toISOString(),
      },
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useRegister({ onSuccess }), { wrapper });

    act(() => {
      result.current.register({
        email: 'jordan@example.com',
        password: 'password123',
        fullName: 'Jordan Lee',
      });
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('token-abc'));
    expect(useAuthStore.getState().user?.email).toBe('jordan@example.com');
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ email: 'jordan@example.com' }));
  });

  it('surfaces the server error message on failed registration without touching authStore', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: {
          success: false,
          message: 'Email already registered',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useRegister(), { wrapper });

    act(() => {
      result.current.register({
        email: 'jordan@example.com',
        password: 'password123',
        fullName: 'Jordan Lee',
      });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('Email already registered'));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
