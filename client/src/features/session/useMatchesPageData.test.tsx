import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
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
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

/** A single Basketball (sportId 6) profile — CLIENT-SESSION-29 (2026-09-23): /matches no longer
 * has an "all" sport state, so `useMatchesActiveSport` needs real `/sports/profiles` data to
 * default to (same requirement `useProfileActiveSport`'s own tests already have). Basketball
 * matches `makeSession`'s own default `sportId: 6`, so every existing fixture below (which never
 * overrides `sportId`) keeps matching the auto-selected active sport unchanged. */
function basketballProfile() {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 6,
    sportName: 'Basketball',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
  };
}

/** Every test needs `/groups/user/user-1`, `/sessions/upcoming`, `/sessions/history`,
 * `/sessions/discover`, and `/sports/profiles` mocked (all fire once a user + active sport are
 * set) — this fills in empty/default-basketball defaults for whichever of those a test doesn't
 * care about, so each test only overrides what it's actually exercising. Overrides receive the
 * request config so a test can inspect e.g. `/sessions/discover`'s `sportId` query param. */
function mockGets(
  overrides: Record<string, (config?: { params?: Record<string, unknown> }) => ReturnType<typeof apiResponse>>,
) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url in overrides) return overrides[url](config);
    if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
    if (url === '/sessions/upcoming') return apiResponse(pageResponse([]));
    // /history is two shapes behind one path: `dateCount` -> distinct dates, `date` -> that date's sessions.
    if (url === '/sessions/history') {
      return config?.params?.dateCount !== undefined
        ? apiResponse({ dates: [], hasMore: false })
        : apiResponse(pageResponse([]));
    }
    if (url === '/sessions/discover') return apiResponse(pageResponse([]));
    if (url === '/sessions/discover/counts') return apiResponse({ counts: [] });
    if (url === '/sports/profiles') return apiResponse([basketballProfile()]);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useMatchesPageData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    useMatchesPageStore.setState({ activeSport: null });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('loads the active sport\'s upcoming sessions and groups them by local day, preserving server order', async () => {
    const spy = mockGets({
      '/sessions/upcoming': () =>
        apiResponse(
          pageResponse([
            makeSession({ id: 1, status: 'PREPARING', scheduledStart: '2026-08-05T09:00:00' }),
            makeSession({ id: 2, status: 'SCHEDULED', scheduledStart: '2026-08-05T18:00:00' }),
            makeSession({ id: 3, status: 'ONGOING', scheduledStart: '2026-08-07T10:00:00' }),
          ]),
        ),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });

    await waitFor(() => expect(result.current.isUpcomingLoading).toBe(false));
    expect(result.current.upcomingDateGroups.map((g) => [g.dateKey, g.sessions.map((s) => s.id)])).toEqual([
      ['2026-08-05', [1, 2]],
      ['2026-08-07', [3]],
    ]);

    // Server-side sport scoping (backend SESSION-43), one 20-row page, and — crucially — no
    // viewerZoneId: the backend 400s on it without a `date`.
    const call = spy.mock.calls.find(([url]) => url === '/sessions/upcoming')!;
    expect(call[1]?.params).toEqual({ sportId: 6, page: 0, size: 20 });
    expect(call[1]?.params).not.toHaveProperty('viewerZoneId');
  });

  it('"Load more" fetches the next upcoming page and merges it into the same day groups', async () => {
    mockGets({
      '/sessions/upcoming': (config) =>
        config?.params?.page === 1
          ? apiResponse({
              ...pageResponse([makeSession({ id: 3, status: 'SCHEDULED', scheduledStart: '2026-08-05T20:00:00' })]),
              number: 1,
              last: true,
            })
          : apiResponse({
              ...pageResponse([makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-05T09:00:00' })]),
              number: 0,
              last: false,
            }),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.hasMoreUpcoming).toBe(true));

    await act(async () => {
      await result.current.onLoadMoreUpcoming();
    });

    await waitFor(() => expect(result.current.hasMoreUpcoming).toBe(false));
    expect(result.current.upcomingDateGroups).toHaveLength(1);
    expect(result.current.upcomingDateGroups[0].sessions.map((s) => s.id)).toEqual([1, 3]);
  });

  it('loads history dates for the active sport in the viewer zone, and pages further back with the last date as the before cursor', async () => {
    const spy = mockGets({
      '/sessions/history': (config) => {
        if (config?.params?.before === '2026-09-10') {
          return apiResponse({ dates: [{ date: '2026-09-05', count: 1 }], hasMore: false });
        }
        return apiResponse({
          dates: [
            { date: '2026-09-14', count: 2 },
            { date: '2026-09-10', count: 1 },
          ],
          hasMore: true,
        });
      },
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.historyDates).toHaveLength(2));
    expect(result.current.hasMoreHistoryDates).toBe(true);

    const first = spy.mock.calls.find(([url, config]) => url === '/sessions/history' && config?.params?.dateCount !== undefined)!;
    expect(first[1]?.params).toMatchObject({ dateCount: 20, sportId: 6 });
    expect(typeof first[1]?.params?.viewerZoneId).toBe('string');
    expect(first[1]?.params).not.toHaveProperty('before');

    await act(async () => {
      await result.current.onLoadMoreHistoryDates();
    });
    await waitFor(() => expect(result.current.historyDates.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-10', '2026-09-05']));
    expect(result.current.hasMoreHistoryDates).toBe(false);
  });

  it('history rows start collapsed, toggleHistoryDate expands/collapses one, and switching sport collapses them all again', async () => {
    mockGets({
      '/sports/profiles': () =>
        apiResponse([
          { ...basketballProfile(), id: 1, sportId: 5, sportName: 'Football' },
          { ...basketballProfile(), id: 2, sportId: 6, sportName: 'Basketball' },
        ]),
      '/sessions/history': () => apiResponse({ dates: [{ date: '2026-09-14', count: 2 }], hasMore: false }),
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.historyDates).toHaveLength(1));
    expect(result.current.expandedHistoryDates.size).toBe(0);

    act(() => result.current.toggleHistoryDate('2026-09-14'));
    expect(result.current.expandedHistoryDates.has('2026-09-14')).toBe(true);
    act(() => result.current.toggleHistoryDate('2026-09-14'));
    expect(result.current.expandedHistoryDates.has('2026-09-14')).toBe(false);

    act(() => result.current.toggleHistoryDate('2026-09-14'));
    expect(result.current.expandedHistoryDates.has('2026-09-14')).toBe(true);
    act(() => useMatchesPageStore.getState().setActiveSport('basketball'));
    await waitFor(() => expect(result.current.expandedHistoryDates.size).toBe(0));
  });

  it('a caller with no sport profile never fires /upcoming or /history (both need a resolved sport)', async () => {
    const spy = mockGets({ '/sports/profiles': () => apiResponse([]) });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isUpcomingLoading).toBe(false));

    expect(spy.mock.calls.some(([url]) => url === '/sessions/upcoming')).toBe(false);
    expect(spy.mock.calls.some(([url]) => url === '/sessions/history')).toBe(false);
    expect(result.current.upcomingDateGroups).toEqual([]);
    expect(result.current.historyDates).toEqual([]);
  });

  // CLIENT-SESSION-29 (2026-09-23) — "no All sport" (user decision): /matches always has exactly
  // one real sport active, defaulting to the caller's first profile. CLIENT-SESSION-23: that
  // sport now scopes Upcoming/History *server-side* (sportId param), so this proves the param
  // follows the pill for all three lists — never a client-side filter over a returned page.
  it('scopes Discover, Upcoming and History by the active sport, defaulting to the first sport profile', async () => {
    const spy = mockGets({
      '/sports/profiles': () =>
        apiResponse([
          { ...basketballProfile(), id: 1, sportId: 5, sportName: 'Football' },
          { ...basketballProfile(), id: 2, sportId: 6, sportName: 'Basketball' },
        ]),
      '/sessions/upcoming': (config) => {
        const all = [
          makeSession({ id: 1, status: 'SCHEDULED', sportId: 6, scheduledStart: '2026-08-01T10:00:00' }),
          makeSession({ id: 2, status: 'SCHEDULED', sportId: 5, scheduledStart: '2026-08-02T10:00:00' }),
        ];
        return apiResponse(pageResponse(all.filter((s) => s.sportId === config?.params?.sportId)));
      },
      '/sessions/discover': (config) => {
        const all = [
          makeSession({ id: 3, sportId: 6, status: 'SCHEDULED', scheduledStart: '2026-08-03T10:00:00' }),
          makeSession({ id: 4, sportId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-04T10:00:00' }),
        ];
        const sportId = config?.params?.sportId;
        return apiResponse(pageResponse(sportId === undefined ? all : all.filter((s) => s.sportId === sportId)));
      },
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    // Defaults to the first profile (football, sportId 5) — only id 2/4 match, never both sports.
    await waitFor(() => expect(result.current.dateSections[0].sessions).toHaveLength(1));
    expect(result.current.dateSections[0].sessions[0].id).toBe(4);
    await waitFor(() => expect(result.current.upcomingDateGroups.flatMap((g) => g.sessions)).toHaveLength(1));
    expect(result.current.upcomingDateGroups[0].sessions[0].id).toBe(2);
    expect(result.current.activeSportId).toBe(5);

    act(() => useMatchesPageStore.getState().setActiveSport('basketball'));

    await waitFor(() => expect(result.current.upcomingDateGroups[0]?.sessions[0].id).toBe(1));
    await waitFor(() => expect(result.current.dateSections[0].sessions[0]?.id).toBe(3));
    expect(result.current.activeSportId).toBe(6);
    expect(
      spy.mock.calls.filter(([url]) => url === '/sessions/history').every(([, config]) => config?.params?.sportId !== undefined),
    ).toBe(true);
  });

  it("sends the debounced search text as /discover's title param", async () => {
    mockGets({
      '/sessions/discover': (config) => {
        const title = config?.params?.title as string | undefined;
        const all = [
          makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', title: 'Sunday pickup run' }),
          makeSession({ id: 2, status: 'SCHEDULED', scheduledStart: '2026-08-02T10:00:00', title: 'Evening scrimmage' }),
        ];
        return apiResponse(
          pageResponse(title === undefined ? all : all.filter((s) => s.title?.includes(title))),
        );
      },
    });

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.dateSections[0].sessions).toHaveLength(2));

    act(() => result.current.setSearchText('pickup'));
    await waitFor(() => expect(result.current.dateSections[0].sessions).toHaveLength(1), { timeout: 2000 });
    expect(result.current.dateSections[0].sessions[0].id).toBe(1);
  });

  it('toggleMySessionsPanelCollapsed and toggleDateGroupCollapsed flip their own state', async () => {
    mockGets({});
    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isUpcomingLoading).toBe(false));

    expect(result.current.isMySessionsPanelCollapsed).toBe(false);
    act(() => result.current.toggleMySessionsPanelCollapsed());
    expect(result.current.isMySessionsPanelCollapsed).toBe(true);

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
    await waitFor(() => expect(result.current.isUpcomingLoading).toBe(false));

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

  it('canManage is true for the standalone creator', async () => {
    mockGets({
      '/sessions/7': () =>
        apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'user-1' }),
        ),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManage).toBe(true);
  });

  it('canManage is false for a standalone session created by someone else', async () => {
    mockGets({
      '/sessions/7': () =>
        apiResponse(
          makeSession({ id: 7, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00', createdBy: 'someone-else' }),
        ),
      '/sessions/7/participants': () => apiResponse(pageResponse([])),
    });

    const { result } = renderHook(() => useMatchesPageData(7), { wrapper });
    await waitFor(() => expect(result.current.selectedSession?.id).toBe(7));
    expect(result.current.canManage).toBe(false);
  });

  it('submitCreate posts the payload and closes the create modal on success', async () => {
    mockGets({});
    const created = makeSession({ id: 99, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(created));

    const { result } = renderHook(() => useMatchesPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isUpcomingLoading).toBe(false));

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
