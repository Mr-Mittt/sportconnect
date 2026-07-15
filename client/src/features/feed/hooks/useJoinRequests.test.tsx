import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useJoinRequests } from './useJoinRequests';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useJoinRequests', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not fetch while userId is undefined', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useJoinRequests(undefined), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls GET /groups/join-requests/user/{userId} once userId is provided', async () => {
    const emptyPage = {
      content: [],
      totalPages: 1,
      totalElements: 0,
      number: 0,
      size: 20,
      first: true,
      last: true,
      numberOfElements: 0,
      empty: true,
    };
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useJoinRequests('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/groups/join-requests/user/user-1');
  });
});
