import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useUnreadNotificationCount } from './useUnreadNotificationCount';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

describe('useUnreadNotificationCount (NTF-3, real GET /notifications/unread-count)', () => {
  it('returns the real unread count once loaded', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(5));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/notifications/unread-count');
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBe(5);
  });

  it('returns 0 (not undefined) while loading', () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(5));

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper });

    expect(result.current.data).toBe(0);
  });
});
