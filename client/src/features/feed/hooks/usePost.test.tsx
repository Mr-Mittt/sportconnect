import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Post } from '../types';
import { usePost } from './usePost';

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
    // No QueryClient-level `retry: false` here on purpose — this asserts
    // usePost's own per-query retry function skips retrying a 404 itself
    // (a real, verified UX gap: without it, "Couldn't load this post."
    // took several seconds to appear behind TanStack's default 3-attempt
    // backoff — confirmed live against the real backend).
    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue({
      response: { status: 404, data: { success: false, message: 'Post not found', data: null } },
    });
    const queryClient = new QueryClient();

    const { result } = renderHook(() => usePost(999), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('still retries a non-404 failure (e.g. a transient 500)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });
    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue({
      response: { status: 500, data: { success: false, message: 'Server error', data: null } },
    });

    const { result } = renderHook(() => usePost(999), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    // Default retry: false is not set at the QueryClient level here, so
    // usePost's own retry function's `failureCount < 3` branch applies —
    // 1 initial attempt + 3 retries = 4 calls.
    expect(getSpy).toHaveBeenCalledTimes(4);
  });
});
