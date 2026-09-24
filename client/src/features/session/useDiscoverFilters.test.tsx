import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import { useDiscoverFilters } from './useDiscoverFilters';

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

function makeSession(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
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
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
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

type GetConfig = { params?: Record<string, unknown> };

function mockGets(overrides: Record<string, (config?: GetConfig) => ReturnType<typeof apiResponse>>) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: GetConfig) => {
    if (url in overrides) return overrides[url](config);
    if (url === '/sessions/discover') return apiResponse(pageResponse([]));
    if (url === '/sessions/discover/counts') return apiResponse({ counts: [] });
    if (url === '/locations/favorites') return apiResponse(pageResponse([]));
    if (url === '/locations/search') return apiResponse(pageResponse([]));
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useDiscoverFilters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to a single "Today" section, fetched via /discover with no explicit date param on /discover/counts', async () => {
    mockGets({
      '/sessions/discover': () => apiResponse(pageResponse([makeSession({ id: 1 })])),
    });

    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });

    expect(result.current.selectedDates).toHaveLength(1);
    await waitFor(() => expect(result.current.dateSections).toHaveLength(1));
    expect(result.current.dateSections[0].label).toBe('Today');
    expect(result.current.dateSections[0].isExpanded).toBe(true);
    await waitFor(() => expect(result.current.dateSections[0].sessions).toHaveLength(1));

    const countsCall = vi
      .mocked(apiClient.get)
      .mock.calls.find(([url]) => url === '/sessions/discover/counts');
    expect(countsCall?.[1]?.params).not.toHaveProperty('date');
  });

  it('caps the Date selection at MAX_DISCOVER_DATES (8)', () => {
    mockGets({});
    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });

    act(() => {
      for (const date of result.current.quickDates) result.current.toggleDate(date);
      // quickDates only covers 7 (today + 6) — add one more via a date outside that window.
      result.current.toggleDate('2026-09-01');
    });
    expect(result.current.selectedDates.length).toBeLessThanOrEqual(8);
    expect(result.current.isDateSelectionAtMax).toBe(true);

    const before = result.current.selectedDates;
    act(() => result.current.toggleDate('2026-09-02'));
    expect(result.current.selectedDates).toEqual(before); // 9th pick is a no-op
  });

  it('never allows zero dates selected — unchecking the last one falls back to today', () => {
    mockGets({});
    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });
    const today = result.current.selectedDates[0];

    act(() => result.current.toggleDate(today));
    expect(result.current.selectedDates).toEqual([today]);
  });

  it('re-expands to the new earliest date once the previous earliest is unchecked', () => {
    mockGets({});
    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });
    const today = result.current.selectedDates[0];
    const later = result.current.quickDates[3];

    act(() => result.current.toggleDate(later));
    expect(result.current.dateSections.find((s) => s.date === today)?.isExpanded).toBe(true);
    expect(result.current.dateSections.find((s) => s.date === later)?.isExpanded).toBe(false);

    act(() => result.current.toggleDate(today)); // uncheck today, leaving only `later`
    expect(result.current.selectedDates).toEqual([later]);
    expect(result.current.dateSections.find((s) => s.date === later)?.isExpanded).toBe(true);
  });

  it('disables the Location filter when sportId is undefined, and resets selections on sport change', async () => {
    mockGets({
      '/locations/favorites': () => apiResponse(pageResponse([location])),
    });

    const { result, rerender } = renderHook(
      ({ sportId }: { sportId: number | undefined }) => useDiscoverFilters(sportId, true),
      {
        wrapper,
        initialProps: { sportId: undefined as number | undefined },
      },
    );
    expect(result.current.isLocationFilterAvailable).toBe(false);

    rerender({ sportId: 6 });
    await waitFor(() => expect(result.current.favoriteLocations).toHaveLength(1));
    act(() => result.current.toggleLocation(location));
    expect(result.current.selectedLocations).toHaveLength(1);

    rerender({ sportId: 5 }); // switching sport clears sport-scoped selections
    expect(result.current.selectedLocations).toHaveLength(0);
  });

  it('CLIENT-SESSION-29: "Choose a location" dedupes instead of toggling off an already-selected one', async () => {
    mockGets({
      '/locations/favorites': () => apiResponse(pageResponse([location])),
    });

    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });
    await waitFor(() => expect(result.current.favoriteLocations).toHaveLength(1));

    act(() => result.current.toggleLocation(location));
    expect(result.current.selectedLocations).toHaveLength(1);

    // Re-picking the same, already-checked location via the LocationPicker's onSelectResult
    // (unlike toggleLocation) must not remove it — it should stay selected.
    act(() => result.current.locationPicker.onSelectResult(location));
    expect(result.current.selectedLocations).toHaveLength(1);
    expect(result.current.selectedLocations[0]).toEqual(location);
  });

  it('sends the debounced search text as the /discover and /discover/counts title param', async () => {
    mockGets({});
    const { result } = renderHook(() => useDiscoverFilters(6, true), { wrapper });

    act(() => result.current.setSearchText('pickup'));

    await waitFor(
      () => {
        const calls = vi.mocked(apiClient.get).mock.calls.filter(([url]) => url === '/sessions/discover');
        expect(calls.at(-1)?.[1]?.params).toMatchObject({ title: 'pickup' });
      },
      { timeout: 2000 },
    );
  });
});
