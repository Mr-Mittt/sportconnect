import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { Hashtag, PageResponse } from '../types';
import { useTrendingHashtags } from './useTrendingHashtags';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useTrendingHashtags', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the raw PageResponse<Hashtag> from GET /hashtags/trending', async () => {
    const responsePage: PageResponse<Hashtag> = {
      content: [{ id: 1, tag: '#fridayrun', usageCount: 12 }],
      totalPages: 1,
      totalElements: 1,
      number: 0,
      size: 10,
      first: true,
      last: true,
      numberOfElements: 1,
      empty: false,
    };
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: responsePage, timestamp: '' },
    });

    const { result } = renderHook(() => useTrendingHashtags(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/hashtags/trending');
    expect(result.current.data).toEqual(responsePage);
  });

  it('surfaces the empty-response shape for the "nothing trending" state', async () => {
    const emptyPage: PageResponse<Hashtag> = {
      content: [],
      totalPages: 1,
      totalElements: 0,
      number: 0,
      size: 10,
      first: true,
      last: true,
      numberOfElements: 0,
      empty: true,
    };
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useTrendingHashtags(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.empty).toBe(true);
  });
});
