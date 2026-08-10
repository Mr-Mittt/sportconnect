import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '../types';
import { usePersonalFeed } from './usePersonalFeed';

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
  content: 'hello',
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
  createdAt: '2026-07-13T09:00:00',
  updatedAt: '2026-07-13T09:00:00',
  broadcastEndTime: null,
};

function page(overrides: Partial<PageResponse<Post>>): PageResponse<Post> {
  return {
    content: [fixturePost],
    totalPages: 2,
    totalElements: 21,
    number: 0,
    size: 20,
    first: true,
    last: false,
    numberOfElements: 1,
    empty: false,
    ...overrides,
  };
}

describe('usePersonalFeed', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches page 0 and returns it in the native infinite-query shape', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: 'Feed retrieved successfully', data: page({}), timestamp: '' },
    });

    const { result } = renderHook(() => usePersonalFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/feed', { params: { page: 0, size: 20 } });
    expect(result.current.data?.pages[0].content).toEqual([fixturePost]);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('reports no next page once the fetched page is last', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: page({ last: true }), timestamp: '' },
    });

    const { result } = renderHook(() => usePersonalFeed(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  // Page-number derivation itself (advancing by lastPage.number + 1 until
  // lastPage.last) is a pure function, unit-tested directly and without any
  // jsdom/renderHook involvement in pagination.test.ts — shared by every
  // infinite-query hook in this feature, not re-verified per hook here.
});
