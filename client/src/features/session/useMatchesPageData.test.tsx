import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import type { Group } from '@/features/feed/types';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import { useMatchesPageData } from './useMatchesPageData';

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

describe('useMatchesPageData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    useMatchesPageStore.setState({ activeSport: 'all' });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('merges group sessions with my standalone sessions, sorted by start time', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') {
        return apiResponse(pageResponse([makeGroup({ id: 5, groupName: 'Riverside Ballers', sportId: 6 })]));
      }
      if (url === '/sessions/group/5') {
        return apiResponse(
          pageResponse([makeSession({ id: 1, groupId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-05T19:00:00' })]),
        );
      }
      if (url === '/sessions/mine') {
        return apiResponse(pageResponse([makeSession({ id: 2, status: 'ONGOING', scheduledStart: '2026-08-01T09:00:00' })]));
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([2, 1]);
    expect(result.current.sessions[1].groupName).toBe('Riverside Ballers');
    expect(result.current.sessions[0].groupName).toBeNull();
  });

  it('filters the list by activeSport', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') {
        return apiResponse(
          pageResponse([
            makeSession({ id: 1, sportId: 6, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }),
            makeSession({ id: 2, sportId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-02T10:00:00' }),
          ]),
        );
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toHaveLength(2);

    act(() => useMatchesPageStore.getState().setActiveSport('basketball'));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0].id).toBe(1);
  });

  it('onViewDetails opens the detail dialog and loads the session + participants', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      if (url === '/sessions/7') {
        return apiResponse(makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }));
      }
      if (url === '/sessions/7/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.selectedSessionId).toBeNull();
    act(() => result.current.onViewDetails(7));
    expect(result.current.selectedSessionId).toBe(7);

    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
  });

  it('seeds selectedSessionId from initialSessionId (deep link)', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      if (url === '/sessions/9') {
        return apiResponse(makeSession({ id: 9, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }));
      }
      if (url === '/sessions/9/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(9), { wrapper });
    expect(result.current.selectedSessionId).toBe(9);
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(9));
  });

  it('joining calls POST /sessions/{id}/join with the selected session id', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      if (url === '/sessions/7') {
        return apiResponse(makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }));
      }
      if (url === '/sessions/7/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(null));

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));

    act(() => result.current.onJoin());
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/sessions/7/join'));
  });

  it('canManageSelected is true for the standalone creator', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      if (url === '/sessions/7') {
        return apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'user-1' }),
        );
      }
      if (url === '/sessions/7/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManageSelected).toBe(true);
  });

  it('canManageSelected is false for a standalone session created by someone else', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      if (url === '/sessions/7') {
        return apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'someone-else' }),
        );
      }
      if (url === '/sessions/7/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManageSelected).toBe(false);
  });

  it('submitCreate posts the payload and closes the create modal on success', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/mine') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });
    const created = makeSession({ id: 99, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(created));

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.openCreateModal());
    expect(result.current.isCreateModalOpen).toBe(true);

    act(() =>
      result.current.submitCreate({
        sportId: 6,
        locationId: 1,
        scheduledStart: '2026-08-01T19:00:00',
        capacity: 10,
        feeType: 'FREE',
      }),
    );

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/sessions', {
        sportId: 6,
        locationId: 1,
        scheduledStart: '2026-08-01T19:00:00',
        capacity: 10,
        feeType: 'FREE',
      }),
    );
    await waitFor(() => expect(result.current.isCreateModalOpen).toBe(false));
  });
});
