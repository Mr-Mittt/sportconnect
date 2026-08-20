import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Comment, PageResponse } from '../types';
import { useLikeComment } from './useLikeComment';

const fixtureComment: Comment = {
  id: 1,
  postId: 7,
  commentType: 'USER',
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  content: 'Nice one!',
  parentCommentId: null,
  likeCount: 2,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
};

function seedCommentsCache(queryClient: QueryClient, comment: Comment) {
  const page: PageResponse<Comment> = {
    content: [comment],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
  };
  queryClient.setQueryData(feedKeys.comments(7), { pages: [page], pageParams: [0] });
}

function readComment(queryClient: QueryClient): Comment | undefined {
  const cached = queryClient.getQueryData<{ pages: PageResponse<Comment>[] }>(feedKeys.comments(7));
  return cached?.pages[0].content[0];
}

describe('useLikeComment', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('optimistically flips isLikedByCurrentUser and increments likeCount', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedCommentsCache(queryClient, fixtureComment);
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

    const { result } = renderHook(() => useLikeComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, commentId: 1 });
    });

    await waitFor(() =>
      expect(readComment(queryClient)).toMatchObject({ isLikedByCurrentUser: true, likeCount: 3 }),
    );

    resolveRequest();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts/comments/1/like');
  });

  it('rolls back on failure', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedCommentsCache(queryClient, fixtureComment);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useLikeComment(), { wrapper });

    act(() => {
      result.current.mutate({ postId: 7, commentId: 1 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readComment(queryClient)).toMatchObject({ isLikedByCurrentUser: false, likeCount: 2 });
  });
});
