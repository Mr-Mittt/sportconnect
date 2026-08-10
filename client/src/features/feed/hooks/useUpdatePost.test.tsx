import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { PageResponse, Post } from '../types';
import { useUpdatePost } from './useUpdatePost';

const fixtureBroadcast: Post = {
  id: 7,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  postType: 'GROUP_BROADCAST',
  groupId: 5,
  content: 'Old message',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: null,
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
  broadcastEndTime: '2026-07-14T09:00:00',
};

function seedGroupFeedCache(queryClient: QueryClient, groupId: number, post: Post) {
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
  queryClient.setQueryData(feedKeys.groupFeed(groupId), { pages: [page], pageParams: [0] });
}

function readCachedContent(queryClient: QueryClient, groupId: number): string | undefined {
  const cached = queryClient.getQueryData<{ pages: PageResponse<Post>[] }>(feedKeys.groupFeed(groupId));
  return cached?.pages[0].content[0].content;
}

describe('useUpdatePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls PUT /posts/{postId} and splices the fresh response into every mounted feed cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedGroupFeedCache(queryClient, 5, fixtureBroadcast);
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const updated: Post = { ...fixtureBroadcast, content: 'Updated message' };
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdatePost(), { wrapper });

    act(() => {
      result.current.mutate({
        postId: 7,
        payload: { content: 'Updated message', locationName: undefined, sportId: undefined },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/posts/7', {
      content: 'Updated message',
      locationName: undefined,
      sportId: undefined,
    });
    expect(readCachedContent(queryClient, 5)).toBe('Updated message');
  });
});
