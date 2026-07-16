import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { PageResponse, Post } from './types';
import { useHashtagResultsData } from './useHashtagResultsData';

const testUser = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function post(overrides: Partial<Post> & Pick<Post, 'id'>): Post {
  return {
    userId: 'someone-else',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    content: 'hello #fridayrun',
    latitude: null,
    longitude: null,
    locationName: null,
    sportId: 5,
    sportName: null,
    visibility: 'public',
    media: [],
    hashtags: ['fridayrun'],
    previewComments: [],
    likeCount: 3,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-07-13T09:00:00',
    updatedAt: '2026-07-13T09:00:00',
    broadcastEndTime: null,
    ...overrides,
  };
}

function page(posts: Post[]): PageResponse<Post> {
  return {
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
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiResponse = <T,>(data: T) => ({ data: { success: true, message: '', data, timestamp: '' } });

describe('useHashtagResultsData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('does not fetch while isOpen is false or tag is null', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useHashtagResultsData(null, false), { wrapper });
    renderHook(() => useHashtagResultsData('#fridayrun', false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches posts for the tag once open, stripping the leading #', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(page([post({ id: 1 })])));

    const { result } = renderHook(() => useHashtagResultsData('#fridayrun', true), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/hashtag/fridayrun', {
      params: { page: 0, size: 20 },
    });
    expect(result.current.isError).toBe(false);
    expect(result.current.currentUserId).toBe('user-1');
    expect(result.current.data.posts).toHaveLength(1);
  });

  it('toggleLike calls the like mutation when the post is not yet liked', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse(page([post({ id: 1, isLikedByCurrentUser: false })])),
    );
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: null, timestamp: '' } });

    const { result } = renderHook(() => useHashtagResultsData('#fridayrun', true), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.toggleLike(1));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/posts/1/like'));
  });

  it('deletePost calls the delete mutation', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(page([post({ id: 1 })])));
    const deleteSpy = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: null, timestamp: '' } });

    const { result } = renderHook(() => useHashtagResultsData('#fridayrun', true), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.deletePost(1));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/posts/1'));
  });

  it('returns an empty array (not undefined) for a tag with zero posts', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(page([])));

    const { result } = renderHook(() => useHashtagResultsData('#nomatches', true), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.posts).toEqual([]);
  });

  it('isLoadMorePostsError is true when fetchMorePosts fails, leaving already-loaded posts intact', async () => {
    let callCount = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return apiResponse({ ...page([post({ id: 1 })]), last: false });
      }
      throw new Error('simulated load-more failure');
    });

    const { result } = renderHook(() => useHashtagResultsData('#fridayrun', true), { wrapper });
    await waitFor(() => expect(result.current.hasMorePosts).toBe(true));

    await act(async () => {
      await result.current.fetchMorePosts();
    });
    await waitFor(() => expect(result.current.isLoadMorePostsError).toBe(true));
    expect(result.current.data.posts).toHaveLength(1);
  });
});
