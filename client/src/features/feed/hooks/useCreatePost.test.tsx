import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Post } from '../types';
import { useCreatePost } from './useCreatePost';

describe('useCreatePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /posts, returns the created post, and invalidates feed queries', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const created: Post = {
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
    };

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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });
});
