import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useChangeEmail } from './useChangeEmail';
import type { UserResponse } from './types';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function rejection(status: number, errorCode: string, errorParams?: Record<string, unknown>) {
  return { isAxiosError: true, response: { status, data: { success: false, message: 'x', errorCode, errorParams, data: null, timestamp: '' } } };
}

const fixtureUser = {
  id: '1',
  email: 'old@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'old@example.com',
  phoneNumber: null,
  avatarUrl: 'https://lh3.googleusercontent.com/a/me',
  roles: ['USER'],
};

const ok = { data: { success: true, message: 'ok', data: null, timestamp: '' } };
const updatedProfile = {
  data: {
    success: true,
    message: 'ok',
    data: { email: 'new@example.com', username: 'new@example.com', avatarUrl: null, isEmailVerified: true } as unknown as UserResponse,
    timestamp: '',
  },
};

describe('useChangeEmail', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession(fixtureUser, 'token-abc');
    vi.restoreAllMocks();
  });

  it('puts the trimmed address, the new-address code and only the chosen proof', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(ok);
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(updatedProfile);
    const { result } = renderHook(() => useChangeEmail(), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: ' new@example.com ',
        newEmailCode: '654321',
        proof: { method: 'email', verificationCode: '123456' },
      }),
    );

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('/users/me/email', {
      newEmail: 'new@example.com',
      newEmailCode: '654321',
      verificationCode: '123456',
    });
  });

  it('on success reads the profile again, copies the new email and avatar into the login snapshot, then calls onSuccess', async () => {
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce(ok);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(updatedProfile);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useChangeEmail({ onSuccess }), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: 'new@example.com',
        newEmailCode: '654321',
        proof: { method: 'password', currentPassword: 'password123' },
      }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('/users/me');
    expect(useAuthStore.getState().user).toMatchObject({ email: 'new@example.com', username: 'new@example.com', avatarUrl: null });
    expect(useAuthStore.getState().accessToken).toBe('token-abc');
  });

  it('still reports success when the profile cannot be read right after (the change went through)', async () => {
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce(ok);
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(rejection(500, 'X'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useChangeEmail({ onSuccess }), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: 'new@example.com',
        newEmailCode: '654321',
        proof: { method: 'password', currentPassword: 'password123' },
      }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it.each(['CHANGE_EMAIL', 'NEW_EMAIL'] as const)('tells which code a VERIFICATION_CODE_INVALID refusal is about: %s', async (purpose) => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(400, 'VERIFICATION_CODE_INVALID', { purpose }));
    const { result } = renderHook(() => useChangeEmail(), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: 'new@example.com',
        newEmailCode: '000000',
        proof: { method: 'email', verificationCode: '111111' },
      }),
    );

    await waitFor(() => expect(result.current.errorCode).toBe('VERIFICATION_CODE_INVALID'));
    expect(result.current.codeSubject).toBe(purpose);
    expect(result.current.errorMessage).toBe('That code isn’t correct. Check it and try again.');
  });

  it('leaves the subject empty for a refusal that is not about a code', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(409, 'EMAIL_ALREADY_REGISTERED'));
    const { result } = renderHook(() => useChangeEmail(), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: 'taken@example.com',
        newEmailCode: '123456',
        proof: { method: 'password', currentPassword: 'password123' },
      }),
    );

    await waitFor(() => expect(result.current.errorCode).toBe('EMAIL_ALREADY_REGISTERED'));
    expect(result.current.codeSubject).toBeNull();
  });

  it('shows the shared try-again-later line for a 503, and the session snapshot is untouched', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(503, 'SERVICE_UNAVAILABLE'));
    const { result } = renderHook(() => useChangeEmail(), { wrapper });

    act(() =>
      result.current.changeEmail({
        newEmail: 'new@example.com',
        newEmailCode: '123456',
        proof: { method: 'password', currentPassword: 'password123' },
      }),
    );

    await waitFor(() => expect(result.current.errorMessage).toBe('This service isn’t available right now. Try again later.'));
    expect(useAuthStore.getState().user?.email).toBe('old@example.com');
  });

  it('reset clears the error', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce(rejection(409, 'EMAIL_ALREADY_REGISTERED'));
    const { result } = renderHook(() => useChangeEmail(), { wrapper });
    act(() =>
      result.current.changeEmail({
        newEmail: 'taken@example.com',
        newEmailCode: '123456',
        proof: { method: 'password', currentPassword: 'password123' },
      }),
    );
    await waitFor(() => expect(result.current.errorCode).not.toBeNull());

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.errorCode).toBeNull());
  });
});
