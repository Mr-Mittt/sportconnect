import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { Session } from '@/shared/types/session';
import { makeSession } from './components/sessionListFixtures';
import { useGroupSessionShortcutData } from './useGroupSessionShortcutData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Noon today and noon on another day, in the viewer's zone (the fixtures have no location zone). */
function noon(dayOffset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function serve(buckets: { ONGOING?: Session[]; SCHEDULED?: Session[]; PREPARING?: Session[]; failing?: 'ONGOING' | 'SCHEDULED' | 'PREPARING' }) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: { bucket?: string } }) => {
    const bucket = config?.params?.bucket as 'ONGOING' | 'SCHEDULED' | 'PREPARING';
    if (buckets.failing === bucket) throw new Error('boom');
    return { data: { success: true, message: '', data: { content: buckets[bucket] ?? [] }, timestamp: url } };
  });
}

afterEach(() => vi.restoreAllMocks());

describe('useGroupSessionShortcutData (CLIENT-GROUP-SESSION-1)', () => {
  it("asks the group's ONGOING, SCHEDULED and PREPARING buckets, one page each", async () => {
    const get = serve({});
    renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(get).toHaveBeenCalledWith('/sessions/group/5', { params: { bucket: 'PREPARING', size: 20 } });
    expect(get).toHaveBeenCalledWith('/sessions/group/5', { params: { bucket: 'ONGOING', size: 20 } });
    expect(get).toHaveBeenCalledWith('/sessions/group/5', { params: { bucket: 'SCHEDULED', size: 20 } });
  });

  it("lists today's ongoing sessions first, then today's scheduled ones, and nothing from another day", async () => {
    serve({
      ONGOING: [makeSession({ id: 1, groupId: 5, status: 'ONGOING', scheduledStart: noon(0) })],
      SCHEDULED: [
        makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', scheduledStart: noon(0) }),
        makeSession({ id: 3, groupId: 5, status: 'SCHEDULED', scheduledStart: noon(1) }),
        makeSession({ id: 4, groupId: 5, status: 'SCHEDULED', scheduledStart: noon(-1) }),
      ],
    });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([1, 2]);
  });

  it('lists today\'s drafts (PREPARING) after the scheduled ones', async () => {
    serve({
      SCHEDULED: [makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', scheduledStart: noon(0) })],
      PREPARING: [
        makeSession({ id: 3, groupId: 5, status: 'PREPARING', scheduledStart: noon(0) }),
        makeSession({ id: 4, groupId: 5, status: 'PREPARING', scheduledStart: noon(1) }),
      ],
    });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([2, 3]);
  });

  it('never lists a completed or a cancelled session, even if a bucket carried one', async () => {
    serve({
      SCHEDULED: [
        makeSession({ id: 2, groupId: 5, status: 'COMPLETED', scheduledStart: noon(0) }),
        makeSession({ id: 3, groupId: 5, status: 'CANCELLED', scheduledStart: noon(0) }),
        makeSession({ id: 4, groupId: 5, status: 'SCHEDULED', scheduledStart: noon(0) }),
      ],
    });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([4]);
  });

  it('lists a session that started yesterday and ends today or tomorrow', async () => {
    const at = (dayOffset: number, hour: number) => {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      date.setDate(date.getDate() + dayOffset);
      return date.toISOString();
    };
    serve({
      ONGOING: [
        makeSession({ id: 1, groupId: 5, status: 'ONGOING', scheduledStart: at(-1, 22), scheduledEndAt: at(0, 2) }),
        makeSession({ id: 2, groupId: 5, status: 'ONGOING', scheduledStart: at(-1, 10), scheduledEndAt: at(1, 10) }),
        makeSession({ id: 3, groupId: 5, status: 'ONGOING', scheduledStart: at(-2, 10), scheduledEndAt: at(-1, 10) }),
      ],
    });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([1, 2]);
  });

  it('reads the day on the location zone: a start that is today there is listed', async () => {
    // 15:00Z on today's UTC date is 22:00 in Ho Chi Minh; the location's zone decides, not the viewer's.
    const start = new Date();
    start.setUTCHours(15, 0, 0, 0);
    const venueNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const venueStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
    serve({
      SCHEDULED: [
        makeSession({
          id: 1,
          groupId: 5,
          status: 'SCHEDULED',
          scheduledStart: start.toISOString(),
          location: { ...makeSession({ id: 0 }).location!, timezone: 'Asia/Ho_Chi_Minh' },
        }),
      ],
    });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.length).toBe(venueNow === venueStart ? 1 : 0);
  });

  it('makes no call while disabled or without a group', () => {
    const get = serve({});
    renderHook(() => useGroupSessionShortcutData(5, false), { wrapper });
    renderHook(() => useGroupSessionShortcutData(undefined, true), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it('reports an error when either bucket fails, and retry asks the failed one again', async () => {
    const get = serve({ ONGOING: [], SCHEDULED: [], failing: 'SCHEDULED' });
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const before = get.mock.calls.length;
    result.current.retry();
    await waitFor(() => expect(get.mock.calls.length).toBe(before + 1));
    expect(get).toHaveBeenLastCalledWith('/sessions/group/5', { params: { bucket: 'SCHEDULED', size: 20 } });
  });
});
