import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '@/features/feed/queryKeys';
import { sessionKeys } from '@/features/session/queryKeys';
import { makeLocation, makeRecurrence } from './fixtures';
import { GENERATION_REFRESH_DELAY_MS } from './hooks';
import { sessionConfigKeys } from './queryKeys';
import { emptyRecurrenceValues } from './recurrenceForm';
import { useRecurrenceFormData } from './useRecurrenceFormData';

/** CLIENT-GROUP-SESSION-5: the recurrence form's data boundary. */
function setupClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

const envelope = (data: unknown) => ({ data: { success: true, message: '', data, timestamp: '' } });

/** Every read the form's composed hooks make answers with nothing (no favourites, no schema, no profile). */
function mockQuietReads() {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/locations/favorites') return envelope({ content: [] });
    return envelope(null);
  });
}

function coded(status: number, errorCode: string) {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'English server prose', errorCode } } as AxiosResponse;
  return error;
}

function setup(ids: { groupId: number | undefined; sportId: number | undefined } = { groupId: 1, sportId: 5 }) {
  mockQuietReads();
  const client = setupClient();
  const hook = renderHook(() => useRecurrenceFormData(ids.groupId, ids.sportId), { wrapper: client.wrapper });
  return { ...client, hook };
}

afterEach(() => vi.restoreAllMocks());

describe('useRecurrenceFormData', () => {
  describe('opening and closing', () => {
    it('starts closed', () => {
      const { hook } = setup();
      expect(hook.result.current.isOpen).toBe(false);
      expect(hook.result.current.editing).toBeNull();
      expect(hook.result.current.isSaved).toBe(false);
    });

    it('Add opens an empty form, and each open is a new form (a new key)', () => {
      const { hook } = setup();
      const firstKey = hook.result.current.formKey;

      act(() => hook.result.current.openAdd());
      expect(hook.result.current.isOpen).toBe(true);
      expect(hook.result.current.editing).toBeNull();
      expect(hook.result.current.selectedLocation).toBeNull();
      expect(hook.result.current.sessionAttributeValues).toEqual({});
      const secondKey = hook.result.current.formKey;
      expect(secondKey).not.toBe(firstKey);

      act(() => hook.result.current.close());
      act(() => hook.result.current.openAdd());
      expect(hook.result.current.formKey).not.toBe(secondKey);
    });

    it('Edit opens the form for that configuration, with its location and attributes', () => {
      const { hook } = setup();
      const recurrence = makeRecurrence({ id: 7, attributes: { level: 'B' }, location: makeLocation({ id: 12, name: 'Lakeside Courts' }) });

      act(() => hook.result.current.openEdit(recurrence));

      expect(hook.result.current.isOpen).toBe(true);
      expect(hook.result.current.editing).toBe(recurrence);
      expect(hook.result.current.selectedLocation?.name).toBe('Lakeside Courts');
      expect(hook.result.current.sessionAttributeValues).toEqual({ level: 'B' });
    });

    it('an Add after an Edit starts clean: nothing of the edited configuration is left', () => {
      const { hook } = setup();
      act(() => hook.result.current.openEdit(makeRecurrence({ attributes: { level: 'B' } })));
      act(() => hook.result.current.openAdd());

      expect(hook.result.current.editing).toBeNull();
      expect(hook.result.current.selectedLocation).toBeNull();
      expect(hook.result.current.sessionAttributeValues).toEqual({});
    });

    it('closing forgets everything', () => {
      const { hook } = setup();
      act(() => hook.result.current.openEdit(makeRecurrence({ attributes: { level: 'B' } })));
      act(() => hook.result.current.close());

      expect(hook.result.current.isOpen).toBe(false);
      expect(hook.result.current.editing).toBeNull();
      expect(hook.result.current.selectedLocation).toBeNull();
      expect(hook.result.current.sessionAttributeValues).toEqual({});
    });

    it('the picked location and the attribute draft are the form\'s, and a changed attribute merges', () => {
      const { hook } = setup();
      act(() => hook.result.current.openAdd());
      act(() => hook.result.current.onSelectLocation(makeLocation({ id: 30 })));
      act(() => hook.result.current.onSessionAttributeChange('level', 'A'));
      act(() => hook.result.current.onSessionAttributeChange('court', '2'));

      expect(hook.result.current.selectedLocation?.id).toBe(30);
      expect(hook.result.current.sessionAttributeValues).toEqual({ level: 'A', court: '2' });
    });

    it('the location picker opens from the form', () => {
      const { hook } = setup();
      act(() => hook.result.current.openAdd());
      expect(hook.result.current.locationPicker.isOpen).toBe(false);
      act(() => hook.result.current.onOpenLocationPicker());
      expect(hook.result.current.locationPicker.isOpen).toBe(true);
    });
  });

  describe('saving a new configuration', () => {
    it('POSTs the form with the picked location, adds the answer to the list and says it is saved', async () => {
      const { hook, queryClient } = setup();
      const saved = makeRecurrence({ id: 50, dayKey: 3 });
      queryClient.setQueryData(sessionConfigKeys.recurrences(1), [makeRecurrence({ id: 1 })]);
      const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(saved));
      act(() => hook.result.current.openAdd());
      act(() => hook.result.current.onSelectLocation(makeLocation({ id: 9 })));

      await act(async () => hook.result.current.save({ ...emptyRecurrenceValues(), dayKey: 3, start: '19:00', duration: '90' }));

      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      expect(hook.result.current.isSavedDraft).toBe(false);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0][0]).toBe('/sessions/group/1/recurrences');
      expect(post.mock.calls[0][1]).toMatchObject({ dayKey: 3, startTime: '19:00', durationMinutes: 90, locationId: 9, audience: 'ALL_MEMBERS' });
      expect((post.mock.calls[0][1] as { attributes?: unknown }).attributes).toBeUndefined();
      expect(queryClient.getQueryData<{ id: number }[]>(sessionConfigKeys.recurrences(1))?.map((r) => r.id)).toEqual([1, 50]);
    });

    it('a draft answer marks the save as a draft, and a new open forgets it', async () => {
      const { hook } = setup();
      vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(makeRecurrence({ id: 50, draft: true, missing: ['locationId'] })));
      act(() => hook.result.current.openAdd());

      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      expect(hook.result.current.isSavedDraft).toBe(true);

      act(() => hook.result.current.onCreateMore());
      expect(hook.result.current.isSavedDraft).toBe(false);
    });

    it('refreshes the group feed and the group sessions now, and the sessions again once generation has had a moment', async () => {
      const { hook, queryClient } = setup();
      vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(makeRecurrence({ id: 50 })));
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const timers = vi.spyOn(globalThis, 'setTimeout');
      act(() => hook.result.current.openAdd());

      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));

      const keys = invalidate.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(feedKeys.groupFeed(1)));
      expect(keys).toContain(JSON.stringify(sessionKeys.groupSessions(1)));
      const later = timers.mock.calls.find((call) => call[1] === GENERATION_REFRESH_DELAY_MS);
      expect(later).toBeDefined();

      invalidate.mockClear();
      (later![0] as () => void)();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.groupSessions(1) });
    });

    it('a failed save keeps the form: not saved, the coded text of the failure, the list untouched', async () => {
      const { hook, queryClient } = setup();
      queryClient.setQueryData(sessionConfigKeys.recurrences(1), [makeRecurrence({ id: 1 })]);
      vi.spyOn(apiClient, 'post').mockRejectedValue(coded(409, 'SESSION_RECURRENCE_DAY_LIMIT'));
      act(() => hook.result.current.openAdd());

      await act(async () => hook.result.current.save(emptyRecurrenceValues()));

      await waitFor(() => expect(hook.result.current.isSaveError).toBe(true));
      expect(hook.result.current.isSaved).toBe(false);
      expect(hook.result.current.isOpen).toBe(true);
      expect(hook.result.current.saveErrorText).toBeTruthy();
      expect(hook.result.current.saveErrorText).not.toBe('English server prose');
      expect(queryClient.getQueryData<unknown[]>(sessionConfigKeys.recurrences(1))).toHaveLength(1);
    });

    it('an earlier failure is forgotten when the form is opened again', async () => {
      const { hook } = setup();
      vi.spyOn(apiClient, 'post').mockRejectedValue(coded(409, 'SESSION_RECURRENCE_DAY_LIMIT'));
      act(() => hook.result.current.openAdd());
      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(hook.result.current.isSaveError).toBe(true));

      act(() => hook.result.current.close());
      act(() => hook.result.current.openAdd());
      expect(hook.result.current.isSaveError).toBe(false);
    });

    it('saves nothing for a page without a group', async () => {
      const { hook } = setup({ groupId: undefined, sportId: undefined });
      const post = vi.spyOn(apiClient, 'post');
      act(() => hook.result.current.openAdd());

      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('saving an edited configuration', () => {
    it('PUTs to that configuration and replaces it in the list, not adds', async () => {
      const { hook, queryClient } = setup();
      const original = makeRecurrence({ id: 7, dayKey: 2 });
      const replaced = makeRecurrence({ id: 7, dayKey: 4 });
      queryClient.setQueryData(sessionConfigKeys.recurrences(1), [makeRecurrence({ id: 1 }), original]);
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(replaced));
      const post = vi.spyOn(apiClient, 'post');
      act(() => hook.result.current.openEdit(original));

      await act(async () => hook.result.current.save({ ...emptyRecurrenceValues(), dayKey: 4 }));

      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      expect(post).not.toHaveBeenCalled();
      expect(put.mock.calls[0][0]).toBe('/sessions/group/1/recurrences/7');
      expect(put.mock.calls[0][1]).toMatchObject({ dayKey: 4, locationId: original.location?.id });
      const list = queryClient.getQueryData<{ id: number; dayKey: number }[]>(sessionConfigKeys.recurrences(1));
      expect(list).toHaveLength(2);
      expect(list?.find((r) => r.id === 7)?.dayKey).toBe(4);
    });
  });

  describe('Create more', () => {
    it('drops the saved state and starts the form over, still open, as if just opened', async () => {
      const { hook } = setup();
      vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeRecurrence({ id: 7 })));
      act(() => hook.result.current.openEdit(makeRecurrence({ id: 7, attributes: { level: 'B' } })));
      const keyBefore = hook.result.current.formKey;
      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));

      act(() => hook.result.current.onCreateMore());

      expect(hook.result.current.isOpen).toBe(true);
      expect(hook.result.current.isSaved).toBe(false);
      expect(hook.result.current.editing).toBeNull();
      expect(hook.result.current.selectedLocation).toBeNull();
      expect(hook.result.current.sessionAttributeValues).toEqual({});
      expect(hook.result.current.formKey).not.toBe(keyBefore);
    });

    it('the next save is a new configuration (POST), not a replacement of the one just edited', async () => {
      const { hook } = setup();
      const put = vi.spyOn(apiClient, 'put').mockResolvedValue(envelope(makeRecurrence({ id: 7 })));
      const post = vi.spyOn(apiClient, 'post').mockResolvedValue(envelope(makeRecurrence({ id: 51 })));
      act(() => hook.result.current.openEdit(makeRecurrence({ id: 7 })));
      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      act(() => hook.result.current.onCreateMore());

      await act(async () => hook.result.current.save(emptyRecurrenceValues()));
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(put).toHaveBeenCalledTimes(1);
    });
  });

  describe('what is read', () => {
    it('reads the favourites of the group\'s sport only while the form is open', async () => {
      const get = mockQuietReads();
      const client = setupClient();
      const hook = renderHook(() => useRecurrenceFormData(1, 5), { wrapper: client.wrapper });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(get.mock.calls.some((call) => call[0] === '/locations/favorites')).toBe(false);

      act(() => hook.result.current.openAdd());
      await waitFor(() => expect(get.mock.calls.some((call) => call[0] === '/locations/favorites')).toBe(true));
      expect(get).toHaveBeenCalledWith('/locations/favorites', { params: { sportId: 5 } });
    });
  });
});
