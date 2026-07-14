import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PageResponse, Post } from '../types';
import { useCreateComment } from './useCreateComment';

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
  likeCount: 0,
  commentCount: 3,
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

function readCommentCount(queryClient: QueryClient): number | undefined {
  const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(feedKeys.personalFeed());
  return cached?.pages[0].content[0].commentCount;
}

describe('useCreateComment', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('optimistically increments the parent post commentCount for a root comment', async () => {
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

    const { result } = renderHook(() => useCreateComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, payload: { content: 'Nice!' } });
    });

    await waitFor(() => expect(readCommentCount(queryClient)).toBe(4));

    resolveRequest();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts/7/comments', { content: 'Nice!' });
  });

  it('does not touch the parent post commentCount for a reply', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useCreateComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, payload: { content: 'Reply!', parentCommentId: 1 } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readCommentCount(queryClient)).toBe(3);
  });

  it('rolls back the optimistic commentCount bump if the request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedPersonalFeedCache(queryClient, fixturePost);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useCreateComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, payload: { content: 'Nice!' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readCommentCount(queryClient)).toBe(3);
  });
});
