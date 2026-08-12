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
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

/** Every test needs `/groups/user/user-1`, `/sessions/mine`, `/sessions/discover`, and
 * `/sessions/joined` mocked (all fire unconditionally once a user is set) — this fills in
 * empty-page defaults for whichever of those a test doesn't care about, so each test only
 * overrides what it's actually exercising. Overrides receive the request config so a test can
 * inspect e.g. `/sessions/discover`'s `sportId` query param. */
function mockGets(
  overrides: Record<string, (config?: { params?: Record<string, unknown> }) => ReturnType<typeof apiResponse>>,
) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url in overrides) return overrides[url](config);
    if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
    if (url === '/sessions/mine') return apiResponse(pageResponse([]));
    if (url === '/sessions/discover') return apiResponse(pageResponse([]));
    if (url === '/sessions/joined') return apiResponse(pageResponse([]));
    throw new Error(`unexpected GET ${url}`);
  });
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

  it('merges group sessions, my standalone sessions, and joined sessions into date groups, sorted descending', async () => {
    mockGets({
      '/groups/user/user-1': () =>
        apiResponse(pageResponse([makeGroup({ id: 5, groupName: 'Riverside Ballers', sportId: 6 })])),
      '/sessions/group/5': () =>
        apiResponse(
          pageResponse([makeSession({ id: 1, groupId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-05T19:00:00' })]),
        ),
      '/sessions/mine': () =>
        apiResponse(pageResponse([makeSession({ id: 2, status: 'ONGOING', scheduledStart: '2026-08-01T09:00:00' })])),
      '/sessions/joined': () =>
        apiResponse(pageResponse([makeSession({ id: 3, status: 'COMPLETED', scheduledStart: '2026-07-20T09:00:00' })])),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });

    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));
    expect(result.current.mySessionDateGroups.map((g) => g.dateKey)).toEqual([
      '2026-08-05',
      '2026-08-01',
      '2026-07-20',
    ]);
    expect(result.current.mySessionDateGroups[0].sessions[0].groupName).toBe('Riverside Ballers');
    expect(result.current.mySessionDateGroups[1].sessions[0].groupName).toBeNull();
  });

  it('dedupes a self-created standalone session appearing in both mine and joined', async () => {
    mockGets({
      '/sessions/mine': () =>
        apiResponse(pageResponse([makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-05T09:00:00' })])),
      '/sessions/joined': () =>
        apiResponse(pageResponse([makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-05T09:00:00' })])),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));

    expect(result.current.mySessionDateGroups).toHaveLength(1);
    expect(result.current.mySessionDateGroups[0].sessions).toHaveLength(1);
  });

  it('filters both panels by activeSport', async () => {
    mockGets({
      '/sessions/mine': () =>
        apiResponse(
          pageResponse([
            makeSession({ id: 1, sportId: 6, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' }),
            makeSession({ id: 2, sportId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-02T10:00:00' }),
          ]),
        ),
      // Real backend filters by sportId server-side (no client-side sport filtering on
      // discoverSessions) — this mock simulates that so switching sports actually narrows it.
      '/sessions/discover': (config) => {
        const all = [
          makeSession({ id: 3, sportId: 6, status: 'SCHEDULED', scheduledStart: '2026-08-03T10:00:00' }),
          makeSession({ id: 4, sportId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-04T10:00:00' }),
        ];
        const sportId = config?.params?.sportId;
        return apiResponse(
          pageResponse(sportId === undefined ? all : all.filter((s) => s.sportId === sportId)),
        );
      },
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));
    await waitFor(() => expect(result.current.discoverSessions).toHaveLength(2));
    expect(result.current.mySessionDateGroups.flatMap((g) => g.sessions)).toHaveLength(2);

    act(() => useMatchesPageStore.getState().setActiveSport('basketball'));

    await waitFor(() =>
      expect(result.current.mySessionDateGroups.flatMap((g) => g.sessions)).toHaveLength(1),
    );
    expect(result.current.mySessionDateGroups[0].sessions[0].id).toBe(1);
    await waitFor(() => expect(result.current.discoverSessions).toHaveLength(1));
    expect(result.current.discoverSessions[0].id).toBe(3);
  });

  it('discoverSessions filters by the search text (title or location name)', async () => {
    mockGets({
      '/sessions/discover': () =>
        apiResponse(
          pageResponse([
            makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', title: 'Sunday pickup run' }),
            makeSession({ id: 2, status: 'SCHEDULED', scheduledStart: '2026-08-02T10:00:00', title: 'Evening scrimmage' }),
          ]),
        ),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.discoverSessions).toHaveLength(2));

    act(() => result.current.setSearchText('pickup'));
    await waitFor(() => expect(result.current.discoverSessions).toHaveLength(1));
    expect(result.current.discoverSessions[0].id).toBe(1);
  });

  it('toggleHistoryPanelCollapsed and toggleDateGroupCollapsed flip their own state', async () => {
    mockGets({});
    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));

    expect(result.current.isHistoryPanelCollapsed).toBe(false);
    act(() => result.current.toggleHistoryPanelCollapsed());
    expect(result.current.isHistoryPanelCollapsed).toBe(true);

    expect(result.current.collapsedDateKeys.has('2026-08-05')).toBe(false);
    act(() => result.current.toggleDateGroupCollapsed('2026-08-05'));
    expect(result.current.collapsedDateKeys.has('2026-08-05')).toBe(true);
    act(() => result.current.toggleDateGroupCollapsed('2026-08-05'));
    expect(result.current.collapsedDateKeys.has('2026-08-05')).toBe(false);
  });

  it('onViewDetails opens the detail dialog and loads the session + participants', async () => {
    mockGets({
      '/sessions/7': () => apiResponse(makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' })),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));

    expect(result.current.selectedSessionId).toBeNull();
    act(() => result.current.onViewDetails(7));
    expect(result.current.selectedSessionId).toBe(7);

    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
  });

  it('seeds selectedSessionId from initialSessionId (deep link)', async () => {
    mockGets({
      '/sessions/9': () => apiResponse(makeSession({ id: 9, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' })),
      '/sessions/9/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(9), { wrapper });
    expect(result.current.selectedSessionId).toBe(9);
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(9));
  });

  it('joining calls POST /sessions/{id}/join with the selected session id', async () => {
    mockGets({
      '/sessions/7': () => apiResponse(makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' })),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(null));

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));

    act(() => result.current.onJoin());
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/sessions/7/join'));
  });

  it('canManageSelected is true for the standalone creator', async () => {
    mockGets({
      '/sessions/7': () =>
        apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'user-1' }),
        ),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManageSelected).toBe(true);
  });

  it('canManageSelected is false for a standalone session created by someone else', async () => {
    mockGets({
      '/sessions/7': () =>
        apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'someone-else' }),
        ),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManageSelected).toBe(false);
  });

  it('submitCreate posts the payload and closes the create modal on success', async () => {
    mockGets({});
    const created = makeSession({ id: 99, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(created));

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isMySessionsLoading).toBe(false));

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
