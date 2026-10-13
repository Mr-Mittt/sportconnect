import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useForgotPassword } from './useForgotPassword';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useForgotPassword', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the email and reports success', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { success: true, data: null } });
    const { result } = renderHook(() => useForgotPassword(), { wrapper });
    act(() => result.current.requestReset({ email: 'jordan@example.com' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'jordan@example.com' });
    expect(result.current.errorMessage).toBeNull();
  });

  it('exposes a message when the request fails', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useForgotPassword(), { wrapper });
    act(() => result.current.requestReset({ email: 'jordan@example.com' }));
    await waitFor(() => expect(result.current.errorMessage).not.toBeNull());
    expect(result.current.isSuccess).toBe(false);
  });
});
