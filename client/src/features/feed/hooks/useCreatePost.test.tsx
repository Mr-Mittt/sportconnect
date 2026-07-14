import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PageResponse, Post } from '../types';
import { useCreatePost } from './useCreatePost';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 99,
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    content: 'hello world',
    latitude: null,
    longitude: null,
    locationName: null,
    sportId: null,
    sportName: null,
    visibility: 'public',
    media: [],
    hashtags: [],
    previewComments: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-07-13T09:00:00',
    updatedAt: '2026-07-13T09:00:00',
    broadcastEndTime: null,
    ...overrides,
  };
}

function seedFeedCache(queryClient: QueryClient, queryKey: readonly unknown[], posts: Post[]) {
  const page: PageResponse<Post> = {
    content: posts,
    totalPages: 1,
    totalElements: posts.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: posts.length,
    empty: posts.length === 0,
  };
  queryClient.setQueryData(queryKey, { pages: [page], pageParams: [0] });
}

function readFeedCache(queryClient: QueryClient, queryKey: readonly unknown[]) {
  return queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(queryKey);
}

describe('useCreatePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /posts and returns the created post', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const created = makePost();
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Post created successfully', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreatePost(), { wrapper });

    act(() => {
      result.current.mutate({ content: 'hello world' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts', { content: 'hello world' });
    expect(result.current.data).toEqual(created);
  });

  it('prepends the created post to the personal feed cache without a groupId', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedFeedCache(queryClient, feedKeys.personalFeed(), [makePost({ id: 1, content: 'existing' })]);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const created = makePost({ id: 2, content: 'new post' });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreatePost(), { wrapper });

    act(() => {
      result.current.mutate({ content: 'new post' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cache = readFeedCache(queryClient, feedKeys.personalFeed());
    expect(cache?.pages[0].content).toEqual([created, makePost({ id: 1, content: 'existing' })]);
    expect(cache?.pages[0].numberOfElements).toBe(2);
    expect(cache?.pages[0].totalElements).toBe(2);
  });

  it('prepends a GROUP_POST to that group feed cache, not personalFeed', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedFeedCache(queryClient, feedKeys.groupFeed(5), []);
    seedFeedCache(queryClient, feedKeys.personalFeed(), []);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const created = makePost({ id: 3, postType: 'GROUP_POST', groupId: 5 });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreatePost(), { wrapper });

    act(() => {
      result.current.mutate({ content: 'group post', groupId: 5, postType: 'GROUP_POST' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readFeedCache(queryClient, feedKeys.groupFeed(5))?.pages[0].content).toEqual([created]);
    expect(readFeedCache(queryClient, feedKeys.personalFeed())?.pages[0].content).toEqual([]);
  });

  it('invalidates feed queries on settle for eventual consistency', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: makePost(), timestamp: '' },
    });

    const { result } = renderHook(() => useCreatePost(), { wrapper });

    act(() => {
      result.current.mutate({ content: 'hello world' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });
});
