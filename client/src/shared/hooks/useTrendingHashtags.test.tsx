import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useTrendingHashtags } from './useTrendingHashtags';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

describe('useTrendingHashtags (FEED-6, real GET /hashtags/trending)', () => {
  it('maps the real Hashtag shape (no leading #) to TrendingHashtag (with #)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse({
        content: [
          { id: 1, tag: 'fridayrun', usageCount: 128 },
          { id: 2, tag: 'tournament', usageCount: 94 },
        ],
        totalPages: 1,
        totalElements: 2,
        number: 0,
        size: 10,
        first: true,
        last: true,
        numberOfElements: 2,
        empty: false,
      }),
    );

    const { result } = renderHook(() => useTrendingHashtags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/hashtags/trending');
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([
      { tag: '#fridayrun', postCount: 128 },
      { tag: '#tournament', postCount: 94 },
    ]);
  });

  it('returns an empty array (not undefined) while loading or when the page is empty', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse({
        content: [],
        totalPages: 1,
        totalElements: 0,
        number: 0,
        size: 10,
        first: true,
        last: true,
        numberOfElements: 0,
        empty: true,
      }),
    );

    const { result: loadingResult } = renderHook(() => useTrendingHashtags(), { wrapper });
    expect(loadingResult.current.data).toEqual([]);

    await waitFor(() => expect(loadingResult.current.isLoading).toBe(false));
    expect(loadingResult.current.data).toEqual([]);
  });
});
