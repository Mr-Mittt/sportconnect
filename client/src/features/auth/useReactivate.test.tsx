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

  it('posts the ticket to /auth/reactivate, populates authStore and calls onSuccess', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Account reactivated',
        data: { accessToken: 'token-xyz', tokenType: 'Bearer', expiresIn: 300, user: fixtureUser },
        timestamp: new Date().toISOString(),
      },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useReactivate({ onSuccess }), { wrapper });

    act(() => {
      result.current.reactivate('ticket-1');
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('token-xyz'));
    expect(post).toHaveBeenCalledWith('/auth/reactivate', { ticket: 'ticket-1' });
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ email: 'jordan@example.com' }));
  });

  it('shows the localized REACTIVATION_TICKET_INVALID copy for a used ticket, and reset clears it', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: 'Re-activation ticket invalid',
          errorCode: 'REACTIVATION_TICKET_INVALID',
          data: null,
          timestamp: new Date().toISOString(),
        },
      },
    });
    const { result } = renderHook(() => useReactivate(), { wrapper });

    act(() => {
      result.current.reactivate('ticket-1');
    });

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('This re-activation request expired. Sign in again to continue.'),
    );
    expect(useAuthStore.getState().accessToken).toBeNull();

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.errorMessage).toBeNull());
  });

  it('cancel posts the ticket to /auth/reactivate/cancel and calls onCancelled, even if the call fails', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { success: true, message: 'ok', data: null, timestamp: '' } })
      .mockRejectedValueOnce(new Error('network error'));
    const onCancelled = vi.fn();
    const { result } = renderHook(() => useReactivate({ onCancelled }), { wrapper });

    act(() => result.current.cancel('ticket-1'));
    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/auth/reactivate/cancel', { ticket: 'ticket-1' });

    act(() => result.current.cancel('ticket-2'));
    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(2));
  });
});
