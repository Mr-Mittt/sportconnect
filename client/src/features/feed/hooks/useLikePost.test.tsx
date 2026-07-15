import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PageResponse, Post } from '../types';
import { useLikePost } from './useLikePost';

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
  isLikedByCurrentUser: false,
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

describe('useLikePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /posts/{postId}/like and invalidates feed queries on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Post liked successfully', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts/7/like');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });

  it('optimistically flips isLikedByCurrentUser and increments likeCount before the request resolves', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    let resolveRequest!: () => void;
    vi.spyOn(apiClient, 'post').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = () =>
          resolve({ data: { success: true, message: '', data: null, timestamp: '' } });
      }),
    );

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(
        feedKeys.personalFeed(),
      );
      expect(cached?.pages[0].content[0]).toMatchObject({
        isLikedByCurrentUser: true,
        likeCount: 4,
      });
    });

    resolveRequest();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('still likes successfully when a non-infinite feedKeys query is cached (e.g. userGroups after visiting Groups)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    // Page<T>-shaped, not InfiniteData — same shape useUserGroups/usePublicGroups/
    // useJoinRequests cache under the same feedKeys.all prefix.
    queryClient.setQueryData(feedKeys.userGroups('user-1'), {
      content: [],
      totalPages: 0,
      totalElements: 0,
      number: 0,
      size: 20,
      first: true,
      last: true,
      numberOfElements: 0,
      empty: true,
    });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Post liked successfully', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts/7/like');
  });

  it('does not touch a same-numbered cached comment when liking a post (Post/Comment ids are independent sequences and can collide)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost); // fixturePost.id === 7
    const collidingComment = {
      id: 7, // same numeric id as fixturePost, on purpose
      postId: 99,
      userId: 'user-2',
      userFullName: 'Sam',
      userAvatarUrl: null,
      content: 'nice post',
      parentCommentId: null,
      likeCount: 2,
      replyCount: 0,
      isLikedByCurrentUser: false,
      replies: [],
      createdAt: '2026-07-13T09:00:00',
      updatedAt: '2026-07-13T09:00:00',
    };
    const commentsPage = {
      content: [collidingComment],
      totalPages: 1,
      totalElements: 1,
      number: 0,
      size: 20,
      first: true,
      last: true,
      numberOfElements: 1,
      empty: false,
    };
    queryClient.setQueryData(feedKeys.comments(99), { pages: [commentsPage], pageParams: [0] });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Post liked successfully', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cachedComments = queryClient.getQueryData<{ pages: (typeof commentsPage)[] }>(
      feedKeys.comments(99),
    );
    expect(cachedComments?.pages[0].content[0]).toMatchObject({
      isLikedByCurrentUser: false,
      likeCount: 2,
    });
  });

  it('rolls back the optimistic update if the request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(
      feedKeys.personalFeed(),
    );
    expect(cached?.pages[0].content[0]).toMatchObject({
      isLikedByCurrentUser: false,
      likeCount: 3,
    });
  });
});
