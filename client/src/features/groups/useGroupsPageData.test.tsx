import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import type { Group, PageResponse, Post } from '@/features/feed/types';
import { useGroupsPageData } from './useGroupsPageData';

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

function group(overrides: Partial<Group>): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    coverUrl: null,
    isPrivate: false,
    isActive: true,
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    memberCount: 12,
    currentUserRole: 'MEMBER',
    createdAt: '2026-07-01T00:00:00',
    updatedAt: '2026-07-01T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

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

function page<T>(content: T[], overrides: Partial<PageResponse<T>> = {}): PageResponse<T> {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiResponse = <T,>(data: T) => ({ data: { success: true, message: '', data, timestamp: '' } });

// SPORT-1: useGroupsPageData also mounts useSportProfiles now — stub its
// GET so every test's mockImplementation can handle it without special-casing.
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

// FEED-6: one trending hashtag, so every test's mockGet can handle it
// without special-casing (useGroupsPageData mounts useTrendingHashtags too).
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

// FEED-7: empty by default (most tests don't care about broadcasts) —
// pass '/posts/broadcast' in a test's own `handlers` to override.
const emptyBroadcastsPage = page<Post>([]);

function mockGet(handlers: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in handlers) return apiResponse(handlers[url]);
    if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
    if (url === '/hashtags/trending') return apiResponse(trendingHashtagsPage);
    if (url === '/posts/broadcast') return apiResponse(emptyBroadcastsPage);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useGroupsPageData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: null });
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('filters groups to the active sport (football=5)', async () => {
    useFeedSpaceStore.setState({ activeSport: 'football', selectedGroupId: null });
    const groups = [group({ id: 1, sportId: 5 }), group({ id: 2, sportId: 6, groupName: 'Hoops Crew' })];
    mockGet({ '/groups/user/user-1': page(groups), '/posts/feed': page([]) });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });

    await waitFor(() => expect(result.current.data.groups).toHaveLength(1));
    expect(result.current.data.groups[0].id).toBe(1);
  });

  it('"All" shows every joined group across sports', async () => {
    const groups = [group({ id: 1, sportId: 5 }), group({ id: 2, sportId: 6 })];
    mockGet({ '/groups/user/user-1': page(groups), '/posts/feed': page([]) });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });

    await waitFor(() => expect(result.current.data.groups).toHaveLength(2));
  });

  it('on "All", posts come from the personal feed narrowed to GROUP_POST entries', async () => {
    const posts = [
      post({ id: 1, postType: 'GROUP_POST', groupId: 1, sportId: 5 }),
      post({ id: 2, postType: 'USER_FEED', groupId: null }),
    ];
    mockGet({ '/groups/user/user-1': page([]), '/posts/feed': page(posts) });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.posts).toHaveLength(1);
    expect(result.current.data.posts[0].id).toBe(1);
  });

  it('selecting a group switches the feed source to GET /posts/group/{id}', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    const groupPosts = [post({ id: 9, postType: 'GROUP_POST', groupId: 7 })];
    const getSpy = mockGet({ '/groups/user/user-1': page([]), '/posts/group/7': page(groupPosts) });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });

    await waitFor(() => expect(result.current.data.posts).toHaveLength(1));
    expect(result.current.data.posts[0].id).toBe(9);
    expect(getSpy).toHaveBeenCalledWith('/posts/group/7', expect.anything());
    expect(getSpy).not.toHaveBeenCalledWith('/posts/feed', expect.anything());
  });

  it('createPost is a no-op on "All" (no group to attribute the post to)', async () => {
    mockGet({ '/groups/user/user-1': page([]), '/posts/feed': page([]) });
    const postSpy = vi.spyOn(apiClient, 'post');

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.createPost('hello'));

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('createPost sends the selected groupId, postType: GROUP_POST, and the group\'s own sportId when a group is selected', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    // sportId 6 (basketball) — real bug found live: this used to be omitted
    // entirely (-> null server-side) even though the selected group has a
    // definite, known sport. Feed's own sport filter silently hid these
    // posts under any pill except "All" as a result.
    mockGet({
      '/groups/user/user-1': page([group({ id: 7, sportId: 6 })]),
      '/posts/group/7': page([]),
    });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(post({ id: 99, groupId: 7, sportId: 6 })));

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.createPost('hello group'));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/posts', {
        content: 'hello group',
        groupId: 7,
        postType: 'GROUP_POST',
        sportId: 6,
      }),
    );
  });

  it('createPost sends postType: GROUP_BROADCAST and the group\'s sportId when { asBroadcast: true }', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    mockGet({
      '/groups/user/user-1': page([group({ id: 7, sportId: 6 })]),
      '/posts/group/7': page([]),
    });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(post({ id: 99, groupId: 7, sportId: 6, postType: 'GROUP_BROADCAST' })));

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.createPost('court booked', { asBroadcast: true }));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/posts', {
        content: 'court booked',
        groupId: 7,
        postType: 'GROUP_BROADCAST',
        sportId: 6,
      }),
    );
  });

  it('canBroadcast is true only when the selected group\'s currentUserRole is owner/admin', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    const groups = [
      group({ id: 7, currentUserRole: 'group_admin' }),
      group({ id: 8, currentUserRole: 'group_member' }),
    ];
    mockGet({ '/groups/user/user-1': page(groups), '/posts/group/7': page([]) });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canBroadcast).toBe(true);

    useFeedSpaceStore.setState({ selectedGroupId: 8 });
    await waitFor(() => expect(result.current.canBroadcast).toBe(false));
  });

  it('canBroadcast is false when no group is selected ("All")', async () => {
    mockGet({ '/groups/user/user-1': page([group({ id: 7, currentUserRole: 'group_owner' })]) });
    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canBroadcast).toBe(false);
  });

  it('activeBroadcastForSelectedGroup finds the raw active broadcast Post for the selected group', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    const activeBroadcast = post({
      id: 30,
      postType: 'GROUP_BROADCAST',
      groupId: 7,
      content: 'Court booked for Sunday',
    });
    mockGet({
      '/groups/user/user-1': page([group({ id: 7 })]),
      '/posts/group/7': page([]),
      '/posts/broadcast': page([activeBroadcast]),
    });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() =>
      expect(result.current.activeBroadcastForSelectedGroup?.id).toBe(30),
    );
  });

  it('updateBroadcast PUTs the existing broadcast, echoing back its locationName/sportId/visibility', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    const activeBroadcast = post({
      id: 30,
      postType: 'GROUP_BROADCAST',
      groupId: 7,
      content: 'Old message',
      locationName: 'Riverside Courts',
      sportId: 5,
      visibility: 'public',
    });
    mockGet({
      '/groups/user/user-1': page([group({ id: 7 })]),
      '/posts/group/7': page([]),
      '/posts/broadcast': page([activeBroadcast]),
    });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce(apiResponse(activeBroadcast));

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() =>
      expect(result.current.activeBroadcastForSelectedGroup?.id).toBe(30),
    );

    act(() => result.current.updateBroadcast('New message'));

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/posts/30', {
        content: 'New message',
        locationName: 'Riverside Courts',
        sportId: 5,
        visibility: 'public',
      }),
    );
  });

  it('isGroupsError is true when the groups endpoint fails, and retryGroups refetches it', async () => {
    let groupsCallCount = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') {
        groupsCallCount += 1;
        if (groupsCallCount === 1) throw new Error('simulated groups failure');
        return apiResponse(page([group({ id: 1 })]));
      }
      if (url === '/posts/feed') return apiResponse(page([]));
      if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
      if (url === '/hashtags/trending') return apiResponse(trendingHashtagsPage);
      if (url === '/posts/broadcast') return apiResponse(emptyBroadcastsPage);
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isGroupsError).toBe(true));
    expect(result.current.data.groups).toHaveLength(0);

    await act(() => result.current.retryGroups());
    await waitFor(() => expect(result.current.isGroupsError).toBe(false));
    expect(result.current.data.groups).toHaveLength(1);
  });

  it('isHashtagsError is true when the trending endpoint fails, and retryHashtags refetches it', async () => {
    let trendingCallCount = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/hashtags/trending') {
        trendingCallCount += 1;
        if (trendingCallCount === 1) throw new Error('simulated trending failure');
        return apiResponse(trendingHashtagsPage);
      }
      if (url === '/groups/user/user-1') return apiResponse(page([]));
      if (url === '/posts/feed') return apiResponse(page([]));
      if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
      if (url === '/posts/broadcast') return apiResponse(emptyBroadcastsPage);
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isHashtagsError).toBe(true));

    await act(() => result.current.retryHashtags());
    await waitFor(() => expect(result.current.isHashtagsError).toBe(false));
    expect(result.current.data.hashtags.length).toBeGreaterThan(0);
  });

  it('isLoadMorePostsError is true when fetchMorePosts fails on a selected group\'s feed, leaving already-loaded posts intact', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    let groupFeedCallCount = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/group/7') {
        groupFeedCallCount += 1;
        if (groupFeedCallCount === 1) {
          return apiResponse(page([post({ id: 9, groupId: 7 })], { last: false }));
        }
        throw new Error('simulated load-more failure');
      }
      if (url === '/groups/user/user-1') return apiResponse(page([group({ id: 7 })]));
      if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
      if (url === '/hashtags/trending') return apiResponse(trendingHashtagsPage);
      if (url === '/posts/broadcast') return apiResponse(emptyBroadcastsPage);
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.hasMorePosts).toBe(true));

    await act(async () => {
      await result.current.fetchMorePosts();
    });
    await waitFor(() => expect(result.current.isLoadMorePostsError).toBe(true));
    expect(result.current.data.posts).toHaveLength(1);
  });
});
