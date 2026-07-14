import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Comment, PageResponse, Post } from '../types';
import { useDeleteComment } from './useDeleteComment';

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

const rootComment: Comment = {
  id: 1,
  postId: 7,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  content: 'Root comment',
  parentCommentId: null,
  likeCount: 0,
  replyCount: 1,
  isLikedByCurrentUser: false,
  replies: [
    {
      id: 2,
      postId: 7,
      userId: 'user-1',
      userFullName: 'Jordan Lee',
      userAvatarUrl: null,
      content: 'A reply',
      parentCommentId: 1,
      likeCount: 0,
      replyCount: 0,
      isLikedByCurrentUser: false,
      replies: [],
      createdAt: '2026-07-13T09:05:00',
      updatedAt: '2026-07-13T09:05:00',
    },
  ],
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
};

function seedCaches(queryClient: QueryClient) {
  const postsPage: PageResponse<Post> = {
    content: [fixturePost],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
  };
  queryClient.setQueryData(feedKeys.personalFeed(), { pages: [postsPage], pageParams: [0] });

  const commentsPage: PageResponse<Comment> = {
    content: [rootComment],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
  };
  queryClient.setQueryData(feedKeys.comments(7), { pages: [commentsPage], pageParams: [0] });
}

function readCommentCount(queryClient: QueryClient): number | undefined {
  const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(feedKeys.personalFeed());
  return cached?.pages[0].content[0].commentCount;
}

function readCommentsContent(queryClient: QueryClient): Comment[] | undefined {
  const cached = queryClient.getQueryData<{ pages: PageResponse<Comment>[] }>(feedKeys.comments(7));
  return cached?.pages[0].content;
}

describe('useDeleteComment', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('removes a root comment and decrements the parent post commentCount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedCaches(queryClient);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: '', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useDeleteComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, commentId: 1, parentCommentId: null });
    });

    await waitFor(() => expect(readCommentsContent(queryClient)).toEqual([]));
    expect(readCommentCount(queryClient)).toBe(2);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.delete).toHaveBeenCalledWith('/posts/comments/1');
  });

  it('removes a reply from its parent without touching post commentCount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedCaches(queryClient);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: '', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useDeleteComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, commentId: 2, parentCommentId: 1 });
    });

    await waitFor(() => expect(readCommentsContent(queryClient)?.[0].replies).toEqual([]));
    expect(readCommentCount(queryClient)).toBe(3);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back both caches if the request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedCaches(queryClient);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    vi.spyOn(apiClient, 'delete').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useDeleteComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, commentId: 1, parentCommentId: null });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readCommentsContent(queryClient)).toEqual([rootComment]);
    expect(readCommentCount(queryClient)).toBe(3);
  });
});
