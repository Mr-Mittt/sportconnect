import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { format, subDays } from 'date-fns';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useGroupSessionsTabStore } from '@/app/groupSessionsTabStore';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import { makeSession } from './components/sessionListFixtures';
import { GROUP_SESSION_STATUS_DEFAULTS } from './groupSessionStatuses';
import { useGroupSessionsTabData } from './useGroupSessionsTabData';

/**
 * CLIENT-GROUP-SESSION-2: what the group Sessions tab's data hook asks the server for, how it keeps the three status filters, which
 * history dates it opens, and how it walks empty 30-day windows.
 */

const zone = getViewerZoneId();
const day = (offset: number) => format(subDays(new Date(), -offset), 'yyyy-MM-dd');

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

interface Server {
  today?: unknown[];
  later?: unknown[];
  /** The `/history/dates` answers in call order; the last one repeats. */
  windows?: { dates: { date: string; count: number }[]; hasMore: boolean; nextBefore: string }[];
}

function serve(server: Server = {}) {
  let windowCall = 0;
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url.endsWith('/today')) data = { content: server.today ?? [] };
    else if (url.endsWith('/later')) data = { content: server.later ?? [], last: true, number: 0 };
    else if (url.endsWith('/history/dates')) {
      const windows = server.windows ?? [{ dates: [], hasMore: false, nextBefore: day(-30) }];
      data = windows[Math.min(windowCall, windows.length - 1)];
      windowCall += 1;
    }
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
}

const calls = (get: ReturnType<typeof serve>, suffix: string) =>
  get.mock.calls.filter(([url]) => String(url).endsWith(suffix)) as unknown as [string, { params: Record<string, unknown> }][];

beforeEach(() => {
  useGroupSessionsTabStore.setState({
    statuses: {
      today: [...GROUP_SESSION_STATUS_DEFAULTS.today],
      others: [...GROUP_SESSION_STATUS_DEFAULTS.others],
      history: [...GROUP_SESSION_STATUS_DEFAULTS.history],
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('useGroupSessionsTabData: what it asks for', () => {
  it('asks each section with its default statuses, comma-joined, in the viewer zone', async () => {
    const get = serve();
    renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(calls(get, '/today')[0]).toEqual(['/sessions/group/5/today', { params: { status: 'ONGOING,SCHEDULED,PREPARING', viewerZoneId: zone } }]);
    expect(calls(get, '/later')[0][1].params).toEqual({ status: 'PREPARING,SCHEDULED', viewerZoneId: zone, page: 0, size: 20 });
    expect(calls(get, '/history/dates')[0][1].params).toEqual({ status: 'COMPLETED', days: 30, viewerZoneId: zone });
  });

  it('asks again with the new statuses when a filter changes, always in the section order', async () => {
    const get = serve();
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));

    act(() => result.current.setSectionStatuses('today', ['CANCELLED', 'ONGOING']));
    await waitFor(() => expect(calls(get, '/today')).toHaveLength(2));
    expect(calls(get, '/today')[1][1].params.status).toBe('ONGOING,CANCELLED');
    expect(result.current.statuses.today).toEqual(['ONGOING', 'CANCELLED']);

    act(() => result.current.setSectionStatuses('history', ['CANCELLED', 'COMPLETED']));
    await waitFor(() => expect(calls(get, '/history/dates')).toHaveLength(2));
    expect(calls(get, '/history/dates')[1][1].params.status).toBe('COMPLETED,CANCELLED');
  });

  it('asks nothing for a section with no status selected, and the others carry on', async () => {
    useGroupSessionsTabStore.getState().setStatuses('others', []);
    const get = serve();
    renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(calls(get, '/later')).toHaveLength(0);
  });

  it('asks nothing while disabled', async () => {
    const get = serve();
    renderHook(() => useGroupSessionsTabData(5, false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).not.toHaveBeenCalled();
  });

  it("gives back the server's sessions, flattened over the pages of Others", async () => {
    serve({ today: [makeSession({ id: 1 })], later: [makeSession({ id: 2 }), makeSession({ id: 3 })] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.others.isLoading).toBe(false));
    expect(result.current.today.sessions.map((session) => session.id)).toEqual([1]);
    expect(result.current.others.sessions.map((session) => session.id)).toEqual([2, 3]);
    expect(result.current.others.hasMore).toBe(false);
  });
});

describe('useGroupSessionsTabData: the filters stay for the browser session', () => {
  it('keeps them in the store, shared by every group, in the section order', () => {
    useGroupSessionsTabStore.getState().setStatuses('others', ['CANCELLED', 'PREPARING']);
    expect(useGroupSessionsTabStore.getState().statuses.others).toEqual(['PREPARING', 'CANCELLED']);
    const { result } = renderHook(() => useGroupSessionsTabData(7, false), { wrapper });
    expect(result.current.statuses.others).toEqual(['PREPARING', 'CANCELLED']);
  });

  it('drops a status the section does not offer', () => {
    useGroupSessionsTabStore.getState().setStatuses('history', ['COMPLETED', 'ONGOING']);
    expect(useGroupSessionsTabStore.getState().statuses.history).toEqual(['COMPLETED']);
  });
});

describe('useGroupSessionsTabData: the history dates (a row for every day of every window)', () => {
  const sessionDays = [
    { date: day(-1), count: 2 },
    { date: day(-5), count: 1 },
  ];
  const firstWindow = { dates: sessionDays, hasMore: false, nextBefore: day(-30) };

  it('lists all 30 days before today, newest first, with the count of each and 0 for a day with no finished session', async () => {
    serve({ windows: [firstWindow] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));

    const rows = result.current.history.dates;
    expect(rows[0]).toEqual({ date: day(-1), count: 2 });
    expect(rows[29]).toEqual({ date: day(-30), count: 0 });
    expect(rows.map((row) => row.date)).toEqual(Array.from({ length: 30 }, (_, i) => day(-(i + 1))));
    expect(Object.fromEntries(rows.filter((row) => row.count > 0).map((row) => [row.date, row.count]))).toEqual({
      [day(-1)]: 2,
      [day(-5)]: 1,
    });
  });

  it('lists the 30 days even when the group has no finished session in them', async () => {
    serve({ windows: [{ dates: [], hasMore: false, nextBefore: day(-30) }] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));
    expect(result.current.history.dates.every((row) => row.count === 0)).toBe(true);
    expect(result.current.history.hasMore).toBe(false);
  });

  it('opens yesterday and leaves every other date collapsed', async () => {
    serve({ windows: [firstWindow] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));
    expect([...result.current.history.expandedDates]).toEqual([day(-1)]);
  });

  it('opens yesterday even when it has no session (its row is open and empty)', async () => {
    serve({ windows: [{ dates: [{ date: day(-5), count: 1 }], hasMore: false, nextBefore: day(-30) }] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));
    expect([...result.current.history.expandedDates]).toEqual([day(-1)]);
    expect(result.current.history.dates[0]).toEqual({ date: day(-1), count: 0 });
  });

  it('keeps a date as the viewer toggled it: collapse yesterday, open another', async () => {
    serve({ windows: [firstWindow] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));

    act(() => result.current.history.onToggleDate(day(-1)));
    expect([...result.current.history.expandedDates]).toEqual([]);
    act(() => result.current.history.onToggleDate(day(-5)));
    expect([...result.current.history.expandedDates]).toEqual([day(-5)]);
    act(() => result.current.history.onToggleDate(day(-5)));
    expect([...result.current.history.expandedDates]).toEqual([]);
  });

  it('"Load more" asks for the window before with before = nextBefore and adds its 30 days below', async () => {
    const get = serve({
      windows: [
        { dates: sessionDays, hasMore: true, nextBefore: day(-30) },
        { dates: [{ date: day(-40), count: 3 }], hasMore: false, nextBefore: day(-60) },
      ],
    });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.hasMore).toBe(true));
    expect(result.current.history.dates).toHaveLength(30);

    act(() => result.current.history.onLoadMore());
    await waitFor(() => expect(result.current.history.dates).toHaveLength(60));
    expect(calls(get, '/history/dates')[1][1].params.before).toBe(day(-30));
    const rows = result.current.history.dates;
    expect(rows[30]).toEqual({ date: day(-31), count: 0 });
    expect(rows.find((row) => row.date === day(-40))).toEqual({ date: day(-40), count: 3 });
    expect(rows[59]).toEqual({ date: day(-60), count: 0 });
    expect(result.current.history.hasMore).toBe(false);
  });

  it('an empty window is not followed by itself any more: the next window waits for "Load more"', async () => {
    const get = serve({
      windows: [
        { dates: [], hasMore: true, nextBefore: day(-30) },
        { dates: [{ date: day(-75), count: 1 }], hasMore: false, nextBefore: day(-60) },
      ],
    });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls(get, '/history/dates')).toHaveLength(1);
    expect(result.current.history.hasMore).toBe(true);
  });

  it('reports a failed window and lists nothing', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/history/dates')) throw new Error('boom');
      return { data: { success: true, message: '', data: { content: [], last: true, number: 0 }, timestamp: '' } };
    });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.isError).toBe(true));
    expect(result.current.history.dates).toEqual([]);
    expect(calls(get, '/history/dates')).toHaveLength(1);
  });
});
