import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { Group, Post } from '@/features/feed/types';
import { useGroupBroadcasts } from './useGroupBroadcasts';

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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function pageResponse<T>(content: T[]) {
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
  };
}

function makeGroup(overrides: Partial<Group> & Pick<Group, 'id' | 'groupName' | 'sportId'>): Group {
  return {
    description: null,
    avatarUrl: null,
    coverUrl: null,
    isPrivate: false,
    isActive: true,
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    memberCount: 5,
    currentUserRole: 'group_owner',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

function makeBroadcastPost(overrides: Partial<Post> & Pick<Post, 'id' | 'groupId'>): Post {
  return {
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    postType: 'GROUP_BROADCAST',
    content: 'Court booking confirmed for Sunday.',
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
    broadcastEndTime: '2026-07-14T09:00:00',
    ...overrides,
  };
}

describe('useGroupBroadcasts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('resolves group name/initials/ramp for each broadcast from useUserGroups', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/broadcast') {
        return apiResponse(
          pageResponse([
            makeBroadcastPost({ id: 1, groupId: 5, content: 'Court booking confirmed.' }),
          ]),
        );
      }
      if (url === '/groups/user/user-1') {
        return apiResponse(
          pageResponse([
            makeGroup({ id: 5, groupName: 'Riverside Ballers', sportId: 6 }), // basketball
          ]),
        );
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupBroadcasts(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    // SPORT-3: basketball has no bespoke SPORT_PROFILE_CONFIG entry anymore (real MVP catalog is
    // Badminton/Pickleball only, A6) — getSportProfileConfig's generic fallback ramp applies.
    expect(result.current.data).toEqual([
      {
        id: 1,
        groupId: 5,
        groupName: 'Riverside Ballers',
        groupInitials: 'RB',
        colorRamp: 'gray',
        text: 'Court booking confirmed.',
        createdAt: '2026-07-13T09:00:00',
      },
    ]);
  });

  it("drops a broadcast whose groupId matches none of the caller's groups, without crashing", async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/broadcast') {
        return apiResponse(pageResponse([makeBroadcastPost({ id: 1, groupId: 999 })]));
      }
      if (url === '/groups/user/user-1') {
        return apiResponse(pageResponse([makeGroup({ id: 5, groupName: 'Riverside Ballers', sportId: 6 })]));
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupBroadcasts(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('returns an empty array (not undefined) for a user with no active broadcasts', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/posts/broadcast') return apiResponse(pageResponse([]));
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupBroadcasts(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
