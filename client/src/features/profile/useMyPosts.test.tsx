import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '@/features/feed/types';
import { useMyPosts } from './useMyPosts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const fixturePost: Post = {
  id: 1,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'my own post',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 1,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: '2026-08-26T09:00:00',
  updatedAt: '2026-08-26T09:00:00',
  broadcastEndTime: null,
};

function page(overrides: Partial<PageResponse<Post>>): PageResponse<Post> {
  return {
    content: [fixturePost],
    totalPages: 1,
    totalElements: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 1,
    empty: false,
    ...overrides,
  };
}

describe('useMyPosts', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches page 0 of /posts/mine and returns it in the native infinite-query shape', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: page({}), timestamp: '' },
    });

    const { result } = renderHook(() => useMyPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/mine', { params: { page: 0, size: 20 } });
    expect(result.current.data?.pages[0].content).toEqual([fixturePost]);
    expect(result.current.hasNextPage).toBe(false);
  });
});
