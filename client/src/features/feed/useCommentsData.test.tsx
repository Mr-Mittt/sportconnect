import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { Comment, PageResponse } from '@/features/feed/types';
import { useCommentsData } from './useCommentsData';

const fixtureComment: Comment = {
  id: 1,
  postId: 7,
  commentType: 'USER',
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  content: 'Nice one!',
  parentCommentId: null,
  likeCount: 0,
  replyCount: 0,
  isLikedByCurrentUser: false,
  replies: [],
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
};

function page(comments: Comment[]): PageResponse<Comment> {
  return {
    content: comments,
    totalPages: 1,
    totalElements: comments.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: comments.length,
    empty: comments.length === 0,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCommentsData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('flattens pages into data, and is disabled (no fetch) until isOpen', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    renderHook(() => useCommentsData(7, false), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('fetches and exposes the flattened comment list once open', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: page([fixtureComment]), timestamp: '' },
    });
    const { result } = renderHook(() => useCommentsData(7, true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([fixtureComment]));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('addComment posts a root comment (no parentCommentId)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: page([]), timestamp: '' },
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '', data: fixtureComment, timestamp: '' },
    });
    const { result } = renderHook(() => useCommentsData(7, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.addComment('hello'));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/posts/7/comments', { content: 'hello' }),
    );
  });

  it('addReply posts with the given parentCommentId', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: page([]), timestamp: '' },
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '', data: fixtureComment, timestamp: '' },
    });
    const { result } = renderHook(() => useCommentsData(7, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.addReply(1, 'a reply'));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/posts/7/comments', {
        content: 'a reply',
        parentCommentId: 1,
      }),
    );
  });

  it('deleteComment passes the comment id and parentCommentId through', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: page([]), timestamp: '' },
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      data: { success: true, message: '', data: null, timestamp: '' },
    });
    const { result } = renderHook(() => useCommentsData(7, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.deleteComment(fixtureComment));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/posts/comments/1'));
  });

  it('toggleCommentLike likes when not liked, unlikes when liked', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: page([]), timestamp: '' },
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '', data: null, timestamp: '' },
    });
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      data: { success: true, message: '', data: null, timestamp: '' },
    });
    const { result } = renderHook(() => useCommentsData(7, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleCommentLike(fixtureComment));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/posts/comments/1/like'));

    act(() => result.current.toggleCommentLike({ ...fixtureComment, isLikedByCurrentUser: true }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/posts/comments/1/like'));
  });
});
