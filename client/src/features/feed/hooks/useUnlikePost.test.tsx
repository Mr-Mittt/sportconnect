import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PageResponse, Post } from '../types';
import { useUnlikePost } from './useUnlikePost';

const fixturePost: Post = {
  id: 7,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'hello',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: null,
  sportName: null,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 3,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: true,
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
  broadcastEndTime: null,
};

function seedPersonalFeedCache(queryClient: QueryClient, post: Post) {
  const page: PageResponse<Post> = {
    content: [post],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
  };
  queryClient.setQueryData(feedKeys.personalFeed(), { pages: [page], pageParams: [0] });
}

describe('useUnlikePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls DELETE /posts/{postId}/like and invalidates feed queries on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: 'Post unliked successfully', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useUnlikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.delete).toHaveBeenCalledWith('/posts/7/like');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });

  it('optimistically flips isLikedByCurrentUser and decrements likeCount before the request resolves', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    let resolveRequest!: () => void;
    vi.spyOn(apiClient, 'delete').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = () =>
          resolve({ data: { success: true, message: '', data: null, timestamp: '' } });
      }),
    );

    const { result } = renderHook(() => useUnlikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(
        feedKeys.personalFeed(),
      );
      expect(cached?.pages[0].content[0]).toMatchObject({
        isLikedByCurrentUser: false,
        likeCount: 2,
      });
    });

    resolveRequest();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back the optimistic update if the request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'delete').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useUnlikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(
      feedKeys.personalFeed(),
    );
    expect(cached?.pages[0].content[0]).toMatchObject({
      isLikedByCurrentUser: true,
      likeCount: 3,
    });
  });
});
