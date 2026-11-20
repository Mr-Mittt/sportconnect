import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import { makeSession } from './components/sessionListFixtures';
import { useGroupSessionShortcutData } from './useGroupSessionShortcutData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function serve(content: unknown[], fail = false) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async () => {
    if (fail) throw new Error('boom');
    return { data: { success: true, message: '', data: { content }, timestamp: '' } };
  });
}

afterEach(() => vi.restoreAllMocks());

describe('useGroupSessionShortcutData (CLIENT-GROUP-SESSION-1, one call since CLIENT-GROUP-SESSION-2)', () => {
  it("asks the group's /today once, for ONGOING, SCHEDULED and PREPARING, in the viewer's zone", async () => {
    const get = serve([]);
    renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith('/sessions/group/5/today', {
      params: { status: 'ONGOING,SCHEDULED,PREPARING', viewerZoneId: getViewerZoneId() },
    });
  });

  it("lists the server's sessions as they come, in the server's order, with no client-side day filter", async () => {
    serve([
      makeSession({ id: 1, groupId: 5, status: 'ONGOING', scheduledStart: '2020-01-01T10:00:00Z' }),
      makeSession({ id: 2, groupId: 5, status: 'SCHEDULED' }),
      makeSession({ id: 3, groupId: 5, status: 'PREPARING' }),
    ]);
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions.map((session) => session.id)).toEqual([1, 2, 3]);
    expect(result.current.isError).toBe(false);
  });

  it('asks nothing while disabled or without a group', async () => {
    const get = serve([]);
    const disabled = renderHook(() => useGroupSessionShortcutData(5, false), { wrapper });
    const noGroup = renderHook(() => useGroupSessionShortcutData(undefined, true), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).not.toHaveBeenCalled();
    expect(disabled.result.current.sessions).toEqual([]);
    expect(noGroup.result.current.sessions).toEqual([]);
  });

  it('reports a failed load and retries it', async () => {
    const get = serve([], true);
    const { result } = renderHook(() => useGroupSessionShortcutData(5, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.sessions).toEqual([]);

    get.mockImplementation(async () => ({ data: { success: true, message: '', data: { content: [makeSession({ id: 9, groupId: 5 })] }, timestamp: '' } }));
    result.current.retry();
    await waitFor(() => expect(result.current.sessions.map((session) => session.id)).toEqual([9]));
  });
});
