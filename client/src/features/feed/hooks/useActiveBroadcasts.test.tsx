import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '../types';
import { useActiveBroadcasts } from './useActiveBroadcasts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useActiveBroadcasts', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls GET /posts/broadcast and returns the raw PageResponse<Post>', async () => {
    const responsePage: PageResponse<Post> = {
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
      data: { success: true, message: '', data: responsePage, timestamp: '' },
    });

    const { result } = renderHook(() => useActiveBroadcasts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/broadcast');
    expect(result.current.data).toEqual(responsePage);
  });
});
