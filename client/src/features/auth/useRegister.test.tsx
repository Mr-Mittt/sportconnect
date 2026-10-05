import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import i18next from 'i18next';
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
        status: 400,
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

  it.each([
    ['en', 'An account with this email already exists.'],
    ['vi', 'Đã có tài khoản dùng email này.'],
  ])('shows the localized EMAIL_ALREADY_REGISTERED copy for a 409 and exposes the code (%s)', async (locale, expected) => {
    await i18next.changeLanguage(locale);
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          success: false,
          message: "Email already registered",
          errorCode: "EMAIL_ALREADY_REGISTERED",
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useRegister(), { wrapper });
    act(() => {
      result.current.register({ email: 'jordan@example.com', password: 'password123', fullName: 'Jordan Lee' });
    });

    await waitFor(() => expect(result.current.errorMessage).toBe(expected));
    expect(result.current.errorCode).toBe('EMAIL_ALREADY_REGISTERED');
    expect(result.current.errorFields).toEqual([]);
    await i18next.changeLanguage('en');
  });

  it('shows the generic VALIDATION_FAILED copy and exposes the failed field names', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          message: "Validation failed",
          errorCode: "VALIDATION_FAILED",
          errorParams: { fields: { fullName: 'Full name must not exceed 200 characters', latitude: 'latitude must be between -90 and 90' } },
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const { result } = renderHook(() => useRegister(), { wrapper });
    act(() => {
      result.current.register({ email: 'jordan@example.com', password: 'password123', fullName: 'Jordan Lee' });
    });

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        'Some of the information you entered isn\u2019t valid. Check the form and try again.',
      ),
    );
    expect(result.current.errorFields).toEqual(['fullName', 'latitude']);
  });
});
