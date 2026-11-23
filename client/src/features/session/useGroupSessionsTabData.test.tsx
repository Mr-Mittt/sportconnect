import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useGroupSessionsTabStore } from '@/app/groupSessionsTabStore';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import { makeSession } from './components/sessionListFixtures';
import { GROUP_SESSION_STATUS_DEFAULTS } from './groupSessionStatuses';
import { useGroupSessionsTabData } from './useGroupSessionsTabData';

/**
 * CLIENT-GROUP-SESSION-2: what the group Sessions tab's data hook asks the server for, how it keeps the three status filters and which
 * history dates it opens. CLIENT-GROUP-UI-1: the History shows one month (yesterday's by default), with arrows between the group's
 * first month and yesterday's. The clock is pinned (only `Date`, so the queries still run) to 20 November 2026.
 */

const zone = getViewerZoneId();
const NOW = new Date(2026, 10, 20, 12, 0, 0);

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

interface Server {
  today?: unknown[];
  later?: unknown[];
  /** The dates the `/history/dates` call answers with (every call). */
  historyDates?: { date: string; count: number }[];
}

function serve(server: Server = {}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url.endsWith('/today')) data = { content: server.today ?? [] };
    else if (url.endsWith('/later')) data = { content: server.later ?? [], last: true, number: 0 };
    else if (url.endsWith('/history/dates')) {
      data = { dates: server.historyDates ?? [], hasMore: false, nextBefore: '2026-01-01' };
    }
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
}

const calls = (get: ReturnType<typeof serve>, suffix: string) =>
  get.mock.calls.filter(([url]) => String(url).endsWith(suffix)) as unknown as [string, { params: Record<string, unknown> }][];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  useGroupSessionsTabStore.setState({
    statuses: {
      today: [...GROUP_SESSION_STATUS_DEFAULTS.today],
      others: [...GROUP_SESSION_STATUS_DEFAULTS.others],
      history: [...GROUP_SESSION_STATUS_DEFAULTS.history],
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGroupSessionsTabData: what it asks for', () => {
  it('asks each section with its default statuses, comma-joined, in the viewer zone', async () => {
    const get = serve();
    renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(calls(get, '/today')[0]).toEqual(['/sessions/group/5/today', { params: { status: 'ONGOING,SCHEDULED,PREPARING', viewerZoneId: zone } }]);
    expect(calls(get, '/later')[0][1].params).toEqual({ status: 'PREPARING,SCHEDULED', viewerZoneId: zone, page: 0, size: 20 });
    expect(calls(get, '/history/dates')[0][1].params).toEqual({ status: 'COMPLETED', days: 19, before: '2026-11-20', viewerZoneId: zone });
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


describe('useGroupSessionsTabData: the history month (a row for every day of it)', () => {
  const sessionDays = [
    { date: '2026-11-19', count: 2 },
    { date: '2026-11-05', count: 1 },
  ];
  const historyCalls = (get: ReturnType<typeof serve>) => calls(get, '/history/dates').map(([, options]) => options.params);
  const nowAt = (year: number, monthIndex: number, dayOfMonth: number) => vi.setSystemTime(new Date(year, monthIndex, dayOfMonth, 12, 0, 0));

  it('opens on the month of yesterday and lists its days up to yesterday, newest first, with the count of each and 0 for a day with no finished session', async () => {
    const get = serve({ historyDates: sessionDays });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates[0]).toEqual({ date: '2026-11-19', count: 2 }));
    expect(result.current.history.dates).toHaveLength(19);

    expect(result.current.history.month).toBe('2026-11');
    expect(historyCalls(get)).toEqual([{ status: 'COMPLETED', days: 19, before: '2026-11-20', viewerZoneId: zone }]);
    const rows = result.current.history.dates;
    expect(rows.map((row) => row.date)).toEqual(Array.from({ length: 19 }, (_, i) => `2026-11-${String(19 - i).padStart(2, '0')}`));
    expect(Object.fromEntries(rows.filter((row) => row.count > 0).map((row) => [row.date, row.count]))).toEqual({ '2026-11-19': 2, '2026-11-05': 1 });
  });

  it('on the 1st of a month the History shows the previous month, whole', async () => {
    nowAt(2026, 11, 1);
    const get = serve();
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(30));
    expect(result.current.history.month).toBe('2026-11');
    expect(historyCalls(get)).toEqual([{ status: 'COMPLETED', days: 30, before: '2026-12-01', viewerZoneId: zone }]);
    expect(result.current.history.dates[0].date).toBe('2026-11-30');
    expect(result.current.history.canGoNext).toBe(false);
  });

  it('on 1 January the History shows December of the year before', async () => {
    nowAt(2027, 0, 1);
    const get = serve();
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(31));
    expect(result.current.history.month).toBe('2026-12');
    expect(historyCalls(get)[0]).toMatchObject({ days: 31, before: '2027-01-01' });
  });

  it('the previous arrow asks for that whole month alone, with before = the first of the month after it', async () => {
    const get = serve({ historyDates: [{ date: '2026-10-31', count: 4 }] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(19));

    act(() => result.current.history.onPreviousMonth());
    await waitFor(() => expect(result.current.history.month).toBe('2026-10'));
    await waitFor(() => expect(result.current.history.dates[0]).toEqual({ date: '2026-10-31', count: 4 }));
    expect(result.current.history.dates).toHaveLength(31);
    expect(historyCalls(get)[1]).toEqual({ status: 'COMPLETED', days: 31, before: '2026-11-01', viewerZoneId: zone });
    expect(result.current.history.canGoNext).toBe(true);

    act(() => result.current.history.onNextMonth());
    await waitFor(() => expect(result.current.history.month).toBe('2026-11'));
    expect(result.current.history.canGoNext).toBe(false);
  });

  it('stops going back at the month the group was created in', () => {
    serve();
    const { result } = renderHook(() => useGroupSessionsTabData(5, true, '2026-09-10T08:00:00'), { wrapper });
    expect(result.current.history.canGoPrevious).toBe(true);
    act(() => result.current.history.onPreviousMonth());
    act(() => result.current.history.onPreviousMonth());
    expect(result.current.history.month).toBe('2026-09');
    expect(result.current.history.canGoPrevious).toBe(false);
  });

  it('has no earliest month when the group has no readable creation date', () => {
    serve();
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    act(() => result.current.history.onPreviousMonth());
    act(() => result.current.history.onPreviousMonth());
    expect(result.current.history.canGoPrevious).toBe(true);
    const { result: broken } = renderHook(() => useGroupSessionsTabData(5, true, 'not a date'), { wrapper });
    expect(broken.current.history.canGoPrevious).toBe(true);
  });

  it("starts on yesterday's month again every time the tab is opened (the month is not remembered)", () => {
    serve();
    const first = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    act(() => first.result.current.history.onPreviousMonth());
    expect(first.result.current.history.month).toBe('2026-10');
    first.unmount();
    const second = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    expect(second.result.current.history.month).toBe('2026-11');
  });

  it('opens yesterday and leaves every other date collapsed', async () => {
    serve({ historyDates: sessionDays });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(19));
    expect([...result.current.history.expandedDates]).toEqual(['2026-11-19']);
  });

  it('opens yesterday even when it has no session (its row is open and empty)', async () => {
    serve({ historyDates: [{ date: '2026-11-05', count: 1 }] });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(19));
    expect([...result.current.history.expandedDates]).toEqual(['2026-11-19']);
    expect(result.current.history.dates[0]).toEqual({ date: '2026-11-19', count: 0 });
  });

  it('keeps a date as the viewer toggled it: collapse yesterday, open another', async () => {
    serve({ historyDates: sessionDays });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.dates).toHaveLength(19));

    act(() => result.current.history.onToggleDate('2026-11-19'));
    expect([...result.current.history.expandedDates]).toEqual([]);
    act(() => result.current.history.onToggleDate('2026-11-05'));
    expect([...result.current.history.expandedDates]).toEqual(['2026-11-05']);
    act(() => result.current.history.onToggleDate('2026-11-05'));
    expect([...result.current.history.expandedDates]).toEqual([]);
  });

  it('asks nothing for the History when no status is selected', async () => {
    useGroupSessionsTabStore.getState().setStatuses('history', []);
    const get = serve();
    renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(calls(get, '/history/dates')).toHaveLength(0);
  });

  it('reports a failed month and lists no count', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/history/dates')) throw new Error('boom');
      return { data: { success: true, message: '', data: { content: [], last: true, number: 0 }, timestamp: '' } };
    });
    const { result } = renderHook(() => useGroupSessionsTabData(5, true), { wrapper });
    await waitFor(() => expect(result.current.history.isError).toBe(true));
    expect(result.current.history.dates.every((row) => row.count === 0)).toBe(true);
    expect(calls(get, '/history/dates')).toHaveLength(1);
  });
});
