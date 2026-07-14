import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { Comment, PageResponse } from '../types';
import { useComments } from './useComments';

const fixtureComment: Comment = {
  id: 1,
  postId: 7,
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useComments', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches GET /posts/{postId}/comments when enabled', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: page([fixtureComment]), timestamp: '' },
    });

    const { result } = renderHook(() => useComments(7, true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSpy).toHaveBeenCalledWith('/posts/7/comments', { params: { page: 0, size: 20 } });
    expect(result.current.data?.pages[0].content).toEqual([fixtureComment]);
  });

  it('does not fetch when disabled', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    renderHook(() => useComments(7, false), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });
});
