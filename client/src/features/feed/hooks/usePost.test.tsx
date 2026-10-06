import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { createAppQueryClient } from '@/app/queryClient';
import { feedKeys } from '../queryKeys';
import type { Post } from '../types';
import { usePost } from './usePost';

function httpError(status: number, errorCode?: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'failed', errorCode } } as AxiosResponse;
  return error;
}

const fixturePost: Post = {
  id: 7,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great match today!',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 3,
  commentCount: 1,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
  broadcastEndTime: null,
};

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('usePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches GET /posts/{postId} when not present in any mounted feed cache', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: fixturePost, timestamp: '' },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => usePost(7), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSpy).toHaveBeenCalledWith('/posts/7');
    expect(result.current.data).toEqual(fixturePost);
  });

  it('seeds from an already-mounted feed cache instead of fetching', async () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Simulates usePersonalFeed's already-loaded InfiniteData shape.
    queryClient.setQueryData(feedKeys.personalFeed(), {
      pages: [
        {
          content: [fixturePost],
          totalPages: 1,
          totalElements: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          numberOfElements: 1,
          empty: false,
        },
      ],
      pageParams: [0],
    });

    const { result } = renderHook(() => usePost(7), { wrapper: wrapperFor(queryClient) });

    expect(result.current.data).toEqual(fixturePost);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => usePost(7, false), { wrapper: wrapperFor(queryClient) });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('surfaces isError on a 404 (post not found) without retrying', async () => {
    // CLIENT-ERR-6: usePost has no per-query `retry` any more. This asserts the app default
    // (createAppQueryClient) skips retrying a 404 — the post is gone, not a transient failure.
    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(httpError(404, 'POST_NOT_FOUND'));
    const queryClient = createAppQueryClient();

    const { result } = renderHook(() => usePost(999), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('still retries a non-404 failure (e.g. a transient 500)', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setDefaultOptions({
      queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
    });
    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(httpError(500));

    const { result } = renderHook(() => usePost(999), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    // The app default keeps the usual 3 retries for a 5xx: 1 initial attempt + 3 retries = 4 calls.
    expect(getSpy).toHaveBeenCalledTimes(4);
  });
});
