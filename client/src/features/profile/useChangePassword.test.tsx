import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useChangePassword } from './useChangePassword';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function rejection(status: number, errorCode: string) {
  return {
    isAxiosError: true,
    response: { status, data: { success: false, message: 'x', errorCode, data: null, timestamp: '' } },
  };
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

describe('useChangePassword', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(fixtureUser, 'token-abc');
    vi.restoreAllMocks();
  });

  it('puts both passwords, calls onSuccess and keeps the session', async () => {
    const put = vi
      .spyOn(apiClient, 'put')
      .mockResolvedValueOnce({ data: { success: true, message: 'ok', data: null, timestamp: '' } });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useChangePassword({ onSuccess }), { wrapper });

    act(() => result.current.changePassword({ currentPassword: 'old-password', newPassword: 'new-password-1' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    });
    expect(useAuthStore.getState().accessToken).toBe('token-abc');
  });

  it('flags CURRENT_PASSWORD_INCORRECT with its localized line; reset clears it', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(400, 'CURRENT_PASSWORD_INCORRECT'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useChangePassword({ onSuccess }), { wrapper });

    act(() => result.current.changePassword({ currentPassword: 'wrong', newPassword: 'new-password-1' }));

    await waitFor(() => expect(result.current.errorMessage).toBe('Your current password is incorrect.'));
    expect(result.current.isCurrentPasswordError).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.errorMessage).toBeNull());
    expect(result.current.isCurrentPasswordError).toBe(false);
  });

  it('does not flag other failures as a current-password error', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(400, 'VALIDATION_FAILED'));
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    act(() => result.current.changePassword({ currentPassword: 'old-password', newPassword: 'new-password-1' }));

    await waitFor(() => expect(result.current.errorMessage).not.toBeNull());
    expect(result.current.isCurrentPasswordError).toBe(false);
  });
});
