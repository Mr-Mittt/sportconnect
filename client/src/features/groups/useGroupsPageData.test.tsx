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

function mockGet(handlers: Record<string, unknown>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
    if (url in handlers) return apiResponse(handlers[url]);
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

  it('createPost sends the selected groupId and postType: GROUP_POST when a group is selected', async () => {
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: 7 });
    mockGet({ '/groups/user/user-1': page([]), '/posts/group/7': page([]) });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(post({ id: 99, groupId: 7 })));

    const { result } = renderHook(() => useGroupsPageData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.createPost('hello group'));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/posts', {
        content: 'hello group',
        groupId: 7,
        postType: 'GROUP_POST',
      }),
    );
  });
});
