import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { makeSession } from './components/sessionListFixtures';
import { sessionKeys } from './queryKeys';
import { useSessionDetailModalData } from './useSessionDetailModalData';

/**
 * A caller who loses access to a session they had open (left the group, then opened it from a notification) must see only
 * "You don't have access to this.": TanStack Query keeps the last good `data` when the refetch fails, and the modal used
 * to render that cached session under the message. A 403 or 404 hides the cached session; any other failure keeps it.
 */

const caller = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

const session = makeSession({ id: 40, groupId: 7, createdBy: 'someone-else' });

function statusError(status: number): AxiosError {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    data: { success: false, message: 'x', errorCode: status === 403 ? 'SESSION_GROUP_MEMBER_REQUIRED' : 'SESSION_NOT_FOUND' },
  } as AxiosResponse);
}

/** The detail answers 200 the first time and `status` afterwards (the participants answer the same). */
function mockServer(failure: AxiosError) {
  let detailCalls = 0;
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url === '/sports' || url === '/sports/profiles') data = [];
    else if (url.endsWith('/session-attribute-schema')) data = null;
    else if (url === `/sessions/${session.id}`) {
      detailCalls += 1;
      if (detailCalls > 1) throw failure;
      data = session;
    } else if (url === `/sessions/${session.id}/participants`) {
      data = { content: [{ userId: 'u-9', firstName: 'Sam', lastName: 'Ito', status: 'JOINED' }] };
    }
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
}

function setup(failure: AxiosError) {
  mockServer(failure);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSessionDetailModalData(session.id), { wrapper });
  return { hook, queryClient };
}

beforeEach(() => {
  useAuthStore.setState({ user: caller, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => vi.restoreAllMocks());

describe('useSessionDetailModalData after losing access', () => {
  it.each([403, 404])('hides the cached session and its players once a refetch fails with %i', async (status) => {
    const { hook, queryClient } = setup(statusError(status));
    await waitFor(() => expect(hook.result.current.selectedSession?.id).toBe(session.id));
    await waitFor(() => expect(hook.result.current.participants).toHaveLength(1));

    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail(session.id) }));

    await waitFor(() => expect(hook.result.current.isSessionError).toBe(true));
    expect(hook.result.current.selectedSession).toBeUndefined();
    expect(hook.result.current.participants).toEqual([]);
    expect(hook.result.current.canManage).toBe(false);
  });

  it('keeps the cached session when the refetch fails for another reason (a server error is not a loss of access)', async () => {
    const { hook, queryClient } = setup(statusError(500));
    await waitFor(() => expect(hook.result.current.selectedSession?.id).toBe(session.id));

    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail(session.id) }));

    await waitFor(() => expect(hook.result.current.isSessionError).toBe(true));
    expect(hook.result.current.selectedSession?.id).toBe(session.id);
  });
});
