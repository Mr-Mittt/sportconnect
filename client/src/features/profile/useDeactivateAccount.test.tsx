import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useDeactivateAccount } from './useDeactivateAccount';

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

describe('useDeactivateAccount', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(fixtureUser, 'token-abc');
    vi.restoreAllMocks();
  });

  it('posts the password, clears the session and calls onSuccess', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'ok', data: null, timestamp: '' },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeactivateAccount({ onSuccess }), { wrapper });

    act(() => result.current.deactivate('password123'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/users/me/deactivate', { currentPassword: 'password123' });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('keeps the session and shows the localized line for a wrong password; reset clears it', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          message: 'Current password is incorrect',
          errorCode: 'CURRENT_PASSWORD_INCORRECT',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeactivateAccount({ onSuccess }), { wrapper });

    act(() => result.current.deactivate('wrong'));

    await waitFor(() => expect(result.current.errorMessage).toBe('Your current password is incorrect.'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBe('token-abc');

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.errorMessage).toBeNull());
  });
});
