import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18next from 'i18next';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '@/features/feed/queryKeys';
import { sessionKeys } from '@/features/session/queryKeys';
import { makeRecurrence, makeSettings } from './fixtures';
import { sessionConfigKeys } from './queryKeys';
import { useGroupSessionsConfigData } from './useGroupSessionsConfigData';

/** CLIENT-GROUP-SESSION-4: the Sessions section's data boundary. */
function setupClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

const envelope = (data: unknown) => ({ data: { success: true, message: '', data, timestamp: '' } });

function mockReads(recurrences = [makeRecurrence()]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sessions/group/1/settings') return envelope(makeSettings());
    if (url === '/sessions/group/1/recurrences') return envelope(recurrences);
    throw new Error(`unexpected GET ${url}`);
  });
}

function coded(status: number, errorCode: string) {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'English server prose', errorCode } } as AxiosResponse;
  return error;
}

afterEach(() => vi.restoreAllMocks());

describe('useGroupSessionsConfigData', () => {
  it('reads the settings and the configurations of both modes, only while enabled', async () => {
    const get = mockReads([makeRecurrence(), makeRecurrence({ id: 2, mode: 'MONTHLY', dayKey: 9 })]);
    const { wrapper } = setupClient();

    const idle = renderHook(() => useGroupSessionsConfigData(1, false), { wrapper });
    renderHook(() => useGroupSessionsConfigData(undefined, true), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).not.toHaveBeenCalled();
    expect(idle.result.current.settings).toBeUndefined();

    const active = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
    await waitFor(() => expect(active.result.current.recurrences).toHaveLength(2));
    expect(active.result.current.settings).toEqual(makeSettings());
    expect(get).toHaveBeenCalledWith('/sessions/group/1/settings');
    expect(get).toHaveBeenCalledWith('/sessions/group/1/recurrences');
  });

  describe('turning generation on and off', () => {
    async function ready() {
      mockReads();
      const client = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper: client.wrapper });
      await waitFor(() => expect(hook.result.current.settings).toBeDefined());
      return { ...client, hook };
    }

    it('ON sends only { enabled: true }', async () => {
      const { hook } = await ready();
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeSettings({ enabled: true })));

      await act(async () => hook.result.current.onSetEnabled(true));
      expect(put).toHaveBeenCalledWith('/sessions/group/1/settings', { enabled: true });
    });

    it('OFF keeping the scheduled sessions sends cancelScheduled: false (also when it is not given)', async () => {
      const { hook } = await ready();
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeSettings({ enabled: false })));

      await act(async () => hook.result.current.onSetEnabled(false, false));
      await act(async () => hook.result.current.onSetEnabled(false));
      expect(put).toHaveBeenNthCalledWith(1, '/sessions/group/1/settings', { enabled: false, cancelScheduled: false });
      expect(put).toHaveBeenNthCalledWith(2, '/sessions/group/1/settings', { enabled: false, cancelScheduled: false });
    });

    it('OFF cancelling the remaining sessions sends cancelScheduled: true', async () => {
      const { hook } = await ready();
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeSettings({ enabled: false })));

      await act(async () => hook.result.current.onSetEnabled(false, true));
      expect(put).toHaveBeenCalledWith('/sessions/group/1/settings', { enabled: false, cancelScheduled: true });
    });

    it('the answer replaces the settings in the cache and the group feed (the system post) is refreshed', async () => {
      const { hook, queryClient } = await ready();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeSettings({ enabled: false })));

      await act(async () => hook.result.current.onSetEnabled(false, false));
      await waitFor(() => expect(hook.result.current.settings?.enabled).toBe(false));
      expect(queryClient.getQueryData(sessionConfigKeys.settings(1))).toEqual(makeSettings({ enabled: false }));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKeys.groupFeed(1) });
    });

    it('refreshes the group sessions only when sessions were really cancelled', async () => {
      const { hook, queryClient } = await ready();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const put = vi.spyOn(apiClient, 'put');

      put.mockResolvedValueOnce(envelope(makeSettings({ enabled: false, cancelledSessions: 0 })));
      await act(async () => hook.result.current.onSetEnabled(false, true));
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKeys.groupFeed(1) }));
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: sessionKeys.groupSessions(1) });

      put.mockResolvedValueOnce(envelope(makeSettings({ enabled: false, cancelledSessions: 3 })));
      await act(async () => hook.result.current.onSetEnabled(false, true));
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.groupSessions(1) }));
    });

    it('a failure is reported with its coded text, not the server prose', async () => {
      const { hook } = await ready();
      vi.spyOn(apiClient, 'put').mockRejectedValue(coded(403, 'SESSION_GROUP_ADMIN_REQUIRED'));

      await act(async () => hook.result.current.onSetEnabled(true));
      await waitFor(() => expect(hook.result.current.isUpdateError).toBe(true));
      expect(hook.result.current.updateErrorText).toBe(i18next.t('errors:codes.SESSION_GROUP_ADMIN_REQUIRED'));
      expect(hook.result.current.updateErrorText).not.toBe('English server prose');
    });
  });

  it('switching the mode sends only { mode } unless the owner chose to cancel the scheduled sessions', async () => {
    mockReads();
    const { wrapper } = setupClient();
    const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
    await waitFor(() => expect(hook.result.current.settings).toBeDefined());
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeSettings({ mode: 'MONTHLY' })));

    await act(async () => hook.result.current.onSetMode('MONTHLY'));
    expect(put).toHaveBeenCalledWith('/sessions/group/1/settings', { mode: 'MONTHLY' });

    put.mockClear();
    await act(async () => hook.result.current.onSetMode('MONTHLY', false));
    expect(put).toHaveBeenCalledWith('/sessions/group/1/settings', { mode: 'MONTHLY' });

    put.mockClear();
    await act(async () => hook.result.current.onSetMode('MONTHLY', true));
    expect(put).toHaveBeenCalledWith('/sessions/group/1/settings', { mode: 'MONTHLY', cancelScheduled: true });
  });

  describe('counting the scheduled regular sessions', () => {
    const answer = (count: number) => envelope({ count });

    async function ready() {
      const get = mockReads();
      const { wrapper } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
      await waitFor(() => expect(hook.result.current.settings).toBeDefined());
      return { get, hook };
    }

    it('asks for the whole group (scope ALL) or for one configuration (RECURRENCE and its id) and hands the number over', async () => {
      const { get, hook } = await ready();
      get.mockImplementation(async () => answer(5));
      const onCount = vi.fn();

      await act(async () => hook.result.current.onCountScheduled('ALL', undefined, onCount));
      await waitFor(() => expect(onCount).toHaveBeenCalledWith(5));
      expect(get).toHaveBeenLastCalledWith('/sessions/group/1/regular-sessions/count', { params: { scope: 'ALL', recurrenceId: undefined } });

      await act(async () => hook.result.current.onCountScheduled('RECURRENCE', 7, onCount));
      expect(get).toHaveBeenLastCalledWith('/sessions/group/1/regular-sessions/count', { params: { scope: 'RECURRENCE', recurrenceId: 7 } });
    });

    it('a failed lookup reports isCountError, never calls back, and a reset clears it', async () => {
      const { get, hook } = await ready();
      get.mockRejectedValue(coded(500, 'INTERNAL_ERROR'));
      const onCount = vi.fn();

      await act(async () => hook.result.current.onCountScheduled('ALL', undefined, onCount));
      await waitFor(() => expect(hook.result.current.isCountError).toBe(true));
      expect(onCount).not.toHaveBeenCalled();

      act(() => hook.result.current.onResetCount());
      await waitFor(() => expect(hook.result.current.isCountError).toBe(false));
    });

    it('is busy while it runs, so the other controls wait', async () => {
      const { get, hook } = await ready();
      let resolve: (value: ReturnType<typeof envelope>) => void = () => {};
      get.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );

      act(() => hook.result.current.onCountScheduled('ALL', undefined, () => {}));
      await waitFor(() => expect(hook.result.current.isCounting).toBe(true));
      expect(hook.result.current.isBusy).toBe(true);
      await act(async () => resolve(answer(0)));
      await waitFor(() => expect(hook.result.current.isCounting).toBe(false));
    });

    it('an answer that arrives after a reset (the dialog was closed) is dropped, so it cannot delete or switch anything', async () => {
      const { get, hook } = await ready();
      let resolve: (value: ReturnType<typeof envelope>) => void = () => {};
      get.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const onCount = vi.fn();

      act(() => hook.result.current.onCountScheduled('ALL', undefined, onCount));
      act(() => hook.result.current.onResetCount());
      await act(async () => resolve(answer(3)));
      await waitFor(() => expect(hook.result.current.isCounting).toBe(false));
      expect(onCount).not.toHaveBeenCalled();
    });

    it('does nothing without a group', async () => {
      const get = vi.spyOn(apiClient, 'get');
      const { wrapper } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(undefined, true), { wrapper });
      act(() => hook.result.current.onCountScheduled('ALL', undefined, () => {}));
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('deleting a configuration', () => {
    it('DELETEs that configuration and takes it out of the cached list, nothing else; the group feed is refreshed', async () => {
      mockReads([makeRecurrence({ id: 1 }), makeRecurrence({ id: 2, startTime: '20:00:00' })]);
      const { wrapper, queryClient } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
      await waitFor(() => expect(hook.result.current.recurrences).toHaveLength(2));
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true, message: '', data: { count: 0 }, timestamp: '' } });

      await act(async () => hook.result.current.onDelete(2));

      expect(del).toHaveBeenCalledWith('/sessions/group/1/recurrences/2', { params: undefined });
      await waitFor(() => expect(hook.result.current.recurrences?.map((r) => r.id)).toEqual([1]));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKeys.groupFeed(1) });
      // Nothing was cancelled: the Sessions tab is not asked to reload.
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: sessionKeys.groupSessions(1) });
    });

    it('with cancelScheduled it sends ?cancelScheduled=true and refreshes the group sessions when some were cancelled', async () => {
      mockReads([makeRecurrence({ id: 1 })]);
      const { wrapper, queryClient } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
      await waitFor(() => expect(hook.result.current.recurrences).toHaveLength(1));
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(envelope({ count: 2 }));

      await act(async () => hook.result.current.onDelete(1, true));

      expect(del).toHaveBeenCalledWith('/sessions/group/1/recurrences/1', { params: { cancelScheduled: true } });
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.groupSessions(1) }));
    });

    it('cancelScheduled false sends no parameter', async () => {
      mockReads([makeRecurrence({ id: 1 })]);
      const { wrapper } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
      await waitFor(() => expect(hook.result.current.recurrences).toHaveLength(1));
      const del = vi.spyOn(apiClient, 'delete').mockResolvedValue(envelope({ count: 0 }));

      await act(async () => hook.result.current.onDelete(1, false));
      expect(del).toHaveBeenCalledWith('/sessions/group/1/recurrences/1', { params: undefined });
    });

    it('a failed delete leaves the list alone and reports the coded text', async () => {
      mockReads([makeRecurrence({ id: 1 })]);
      const { wrapper } = setupClient();
      const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
      await waitFor(() => expect(hook.result.current.recurrences).toHaveLength(1));
      vi.spyOn(apiClient, 'delete').mockRejectedValue(coded(404, 'SESSION_RECURRENCE_NOT_FOUND'));

      await act(async () => hook.result.current.onDelete(1));

      await waitFor(() => expect(hook.result.current.isDeleteError).toBe(true));
      expect(hook.result.current.deleteErrorText).toBe('This configuration no longer exists.');
      expect(hook.result.current.recurrences).toHaveLength(1);
    });
  });

  it('is busy while a change is being saved', async () => {
    mockReads();
    const { wrapper } = setupClient();
    const hook = renderHook(() => useGroupSessionsConfigData(1, true), { wrapper });
    await waitFor(() => expect(hook.result.current.settings).toBeDefined());
    expect(hook.result.current.isBusy).toBe(false);

    let resolvePut: (value: ReturnType<typeof envelope>) => void = () => {};
    vi.spyOn(apiClient, 'put').mockReturnValue(new Promise((resolve) => { resolvePut = resolve; }));
    act(() => hook.result.current.onSetEnabled(true));
    await waitFor(() => expect(hook.result.current.isBusy).toBe(true));

    await act(async () => resolvePut(envelope(makeSettings())));
    await waitFor(() => expect(hook.result.current.isBusy).toBe(false));
  });

  it('does nothing without a group', async () => {
    const put = vi.spyOn(apiClient, 'put');
    const del = vi.spyOn(apiClient, 'delete');
    const { wrapper } = setupClient();
    const hook = renderHook(() => useGroupSessionsConfigData(undefined, true), { wrapper });

    act(() => {
      hook.result.current.onSetEnabled(true);
      hook.result.current.onSetMode('MONTHLY');
      hook.result.current.onDelete(1);
    });
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
