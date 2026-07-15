import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/app/authStore';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '@/features/feed/types';
import { useHomeFeedData } from './useHomeFeedData';

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

function post(overrides: Partial<Post>): Post {
  return {
    id: 1,
    userId: 'someone-else',
    userFullName: 'Marcus Lee',
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

function page(posts: Post[], overrides: Partial<PageResponse<Post>> = {}): PageResponse<Post> {
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
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiResponse = <T,>(data: T) => ({ data: { success: true, message: '', data, timestamp: '' } });

// SPORT-1: one real sport profile, so sportProfiles is populated the same
// way it always was here (previously via the mock hook) without every test
// needing its own fixture.
const sportProfiles = [
  {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Soccer',
    skillLevel: null,
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
];

// FEED-6: one trending hashtag, so tests asserting
// `data.hashtags.length` unchanged from before the real hook keep passing.
const trendingHashtagsPage = {
  content: [{ id: 1, tag: 'fridayrun', usageCount: 128 }],
  totalPages: 1,
  totalElements: 1,
  number: 0,
  size: 10,
  first: true,
  last: true,
  numberOfElements: 1,
  empty: false,
};

/**
 * Mocks GET /posts/feed with `feedPage`; GET /sports/profiles/user/{id} and
 * GET /hashtags/trending are stubbed for every test (SPORT-1/FEED-6's real
 * hooks fire alongside the feed query). `/posts/feed` only resolves once,
 * like the old bare `mockResolvedValueOnce` did — several tests below rely
 * on a mutation's background onSettled invalidate *failing* to refetch so it
 * doesn't clobber an optimistic cache update (same reasoning as
 * HomeFeedPage.test.tsx's stateful-fake-server tests, just via "second call
 * fails" instead of a stateful fixture here).
 */
function mockFeedAndSportProfiles(feedPage: PageResponse<Post>) {
  let feedCallCount = 0;
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/posts/feed') {
      feedCallCount += 1;
      if (feedCallCount > 1) throw new Error('simulated network failure on refetch');
      return apiResponse(feedPage);
    }
    if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
    if (url === '/hashtags/trending') return apiResponse(trendingHashtagsPage);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useHomeFeedData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('returns the convention shape with all datasets populated, and the real current user id', async () => {
    mockFeedAndSportProfiles(page([post({ id: 1 })]));

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.currentUserId).toBe('user-1');
    expect(result.current.data.sportProfiles.length).toBeGreaterThan(0);
    expect(result.current.data.posts).toHaveLength(1);
    expect(result.current.data.upcomingMatches.length).toBeGreaterThan(0);
    expect(result.current.data.hashtags.length).toBeGreaterThan(0);
    expect(result.current.data.broadcasts.length).toBeGreaterThan(0);
  });

  it('toggleLike calls the like mutation when the post is not yet liked', async () => {
    mockFeedAndSportProfiles(page([post({ id: 1, isLikedByCurrentUser: false })]));
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: null, timestamp: '' } });

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.toggleLike(1));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/posts/1/like'));
  });

  it('toggleLike calls the unlike mutation when the post is already liked', async () => {
    mockFeedAndSportProfiles(page([post({ id: 1, isLikedByCurrentUser: true })]));
    const deleteSpy = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: null, timestamp: '' } });

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.toggleLike(1));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/posts/1/like'));
  });

  it('deletePost calls DELETE /posts/{postId}', async () => {
    mockFeedAndSportProfiles(page([post({ id: 5 })]));
    const deleteSpy = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: null, timestamp: '' } });

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.deletePost(5));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/posts/5'));
  });

  it('createPost calls POST /posts with just the content and prepends the result', async () => {
    mockFeedAndSportProfiles(page([post({ id: 1 })]));
    const created = post({ id: 2, content: 'New post!', userId: 'user-1' });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { success: true, message: '', data: created, timestamp: '' } });

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));

    act(() => result.current.createPost('New post!'));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/posts', { content: 'New post!' }));
    await waitFor(() => expect(result.current.data.posts).toHaveLength(2));
    expect(result.current.data.posts[0]).toEqual(created);
    expect(result.current.isCreatingPost).toBe(false);
  });

  it('exposes pagination state from the underlying infinite query', async () => {
    mockFeedAndSportProfiles(page([post({ id: 1 })], { last: false }));

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.hasMorePosts).toBe(true));
    expect(result.current.isFetchingMorePosts).toBe(false);
    expect(typeof result.current.fetchMorePosts).toBe('function');
  });

  it('?visual-state=empty still empties upcomingMatches (matches stay mock this whole MVP)', async () => {
    const originalLocation = window.location.href;
    window.history.pushState({}, '', '/?visual-state=empty');

    mockFeedAndSportProfiles(page([post({ id: 1 })]));

    const { result } = renderHook(() => useHomeFeedData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data.upcomingMatches).toEqual([]);
    // posts are unaffected by the seam now — an empty feed comes from a real
    // (MSW-backed in e2e) empty response, not this query param.
    expect(result.current.data.posts).toHaveLength(1);

    window.history.pushState({}, '', originalLocation);
  });
});
