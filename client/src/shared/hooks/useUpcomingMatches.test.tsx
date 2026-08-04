import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { Group } from '@/features/feed/types';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import { useUpcomingMatches } from './useUpcomingMatches';

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
    currentUserRole: 'group_member',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: null,
  latitude: null,
  longitude: null,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function makeSession(overrides: Partial<Session> & Pick<Session, 'id' | 'status' | 'scheduledStart'>): Session {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Pickup run',
    description: null,
    location,
    locationNote: null,
    scheduledEndAt: null,
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

describe('useUpcomingMatches (real, CLIENT-SESSION-1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('merges group sessions with my standalone sessions, sorted by start time', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') {
        return apiResponse(pageResponse([makeGroup({ id: 5, groupName: 'Riverside Ballers', sportId: 6 })]));
      }
      if (url === '/sessions/group/5') {
        return apiResponse(
          pageResponse([
            makeSession({ id: 1, groupId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-05T19:00:00' }),
          ]),
        );
      }
      if (url === '/sessions/mine') {
        return apiResponse(
          pageResponse([makeSession({ id: 2, status: 'ONGOING', scheduledStart: '2026-08-01T09:00:00' })]),
        );
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data.map((session) => session.id)).toEqual([2, 1]);
  });

  it('drops COMPLETED and CANCELLED sessions', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') {
        return apiResponse(
          pageResponse([
            makeSession({ id: 1, status: 'COMPLETED', scheduledStart: '2026-07-01T10:00:00' }),
            makeSession({ id: 2, status: 'CANCELLED', scheduledStart: '2026-07-02T10:00:00' }),
            makeSession({ id: 3, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }),
          ]),
        );
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.map((session) => session.id)).toEqual([3]);
  });

  it('returns an empty array (not undefined) with no groups and no standalone sessions', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
