import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '../types';
import { useGroupFeed } from './useGroupFeed';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function emptyPage(): PageResponse<Post> {
  return {
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
}

describe('useGroupFeed', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not fetch while groupId is undefined', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useGroupFeed(undefined), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches GET /posts/group/{groupId} once groupId is provided', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage(), timestamp: '' },
    });

    const { result } = renderHook(() => useGroupFeed(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/group/42', { params: { page: 0, size: 20 } });
  });
});
