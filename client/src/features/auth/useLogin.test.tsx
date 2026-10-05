import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import i18next from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useLogin } from './useLogin';

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

describe('useLogin', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('populates authStore and calls onSuccess on a successful login', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Login successful',
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
    const { result } = renderHook(() => useLogin({ onSuccess }), { wrapper });

    act(() => {
      result.current.login({ email: 'jordan@example.com', password: 'password123' });
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('token-abc'));
    expect(useAuthStore.getState().user?.email).toBe('jordan@example.com');
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ email: 'jordan@example.com' }));
  });

  it('surfaces the server error message on failed login without touching authStore', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Invalid email or password',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => {
      result.current.login({ email: 'jordan@example.com', password: 'wrong' });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('Invalid email or password'));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it.each([
    ['en', 'Invalid email or password.'],
    ['vi', 'Email hoặc mật khẩu không đúng.'],
  ])('shows the localized INVALID_CREDENTIALS copy for a 401 (%s)', async (locale, expected) => {
    await i18next.changeLanguage(locale);
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: "Invalid email or password",
          errorCode: "INVALID_CREDENTIALS",
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => {
      result.current.login({ email: 'jordan@example.com', password: 'wrong' });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe(expected));
    expect(useAuthStore.getState().accessToken).toBeNull();
    await i18next.changeLanguage('en');
  });

  it('shows the same generic copy for a 400 VALIDATION_FAILED, never the field detail', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          message: "Validation failed",
          errorCode: "VALIDATION_FAILED",
          errorParams: { fields: { password: 'Password is required' } },
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useLogin(), { wrapper });
    act(() => {
      result.current.login({ email: 'jordan@example.com', password: '   ' });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe('Invalid email or password.'));
  });
});
