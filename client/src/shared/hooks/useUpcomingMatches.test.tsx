import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
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

describe('useUpcomingMatches (real, CLIENT-SESSION-23)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  function mockUpcoming(sessions: Session[]) {
    return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/sessions/upcoming') return apiResponse(pageResponse(sessions));
      throw new Error(`unexpected GET ${url}`);
    });
  }

  it('makes one all-sports GET /sessions/upcoming call (no per-group fan-out, no /sessions/mine) and returns its list as-is, in server order', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    const spy = mockUpcoming([
      makeSession({ id: 2, status: 'ONGOING', scheduledStart: '2026-08-01T09:00:00' }),
      makeSession({ id: 1, groupId: 5, status: 'SCHEDULED', scheduledStart: '2026-08-05T19:00:00' }),
    ]);

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data.map((session) => session.id)).toEqual([2, 1]);

    // Exactly one request — the endpoint is already participant-scoped and covers standalone +
    // group-linked sessions — sent with NO sportId (the rail is all-sports) and NO viewerZoneId
    // (the backend 400s on it without a date).
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/sessions/upcoming', { params: { page: 0, size: 20 } });
  });

  // The regression test for the bug CLIENT-SESSION-23 closes: the old client-side filter
  // (status === 'SCHEDULED' || status === 'ONGOING') never let a PREPARING session into the rail.
  // Filtering is now the endpoint's job (PREPARING/SCHEDULED/ONGOING), so the hook must not
  // re-filter — a PREPARING session it is handed has to come out the other side.
  it('includes a PREPARING session — the rail no longer filters status client-side', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    mockUpcoming([
      makeSession({ id: 1, status: 'PREPARING', scheduledStart: '2026-08-01T10:00:00', location: null, feeType: null }),
      makeSession({ id: 2, status: 'SCHEDULED', scheduledStart: '2026-08-02T10:00:00' }),
    ]);

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.map((session) => [session.id, session.status])).toEqual([
      [1, 'PREPARING'],
      [2, 'SCHEDULED'],
    ]);
  });

  it('reads only the first page (the rail caps itself at maxVisible, well inside one page)', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue(
      apiResponse({
        ...pageResponse([makeSession({ id: 1, status: 'SCHEDULED', scheduledStart: '2026-08-01T10:00:00' })]),
        last: false,
      }),
    );

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1); // no automatic page 2 even though `last` is false
  });

  it('returns an empty array (not undefined) when the caller has no upcoming sessions', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    mockUpcoming([]);

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('reports isError when the request fails', async () => {
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useUpcomingMatches(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('does not fire at all before there is a signed-in user', () => {
    const spy = mockUpcoming([]);
    renderHook(() => useUpcomingMatches(), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });
});
