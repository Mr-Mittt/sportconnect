import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useSessionErrorDialogStore } from '@/app/sessionErrorDialogStore';
import type { Session } from '@/shared/types/session';
import { makeSession } from './components/sessionListFixtures';
import { useSessionDetailModalData } from './useSessionDetailModalData';

/** CLIENT-SESSION-49: the detail hook's Share slice: friends fetched only while the dialog is open, the send, and its failures. */

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

const friends = [{ id: 'u-alice', fullName: 'Alice Nguyen', avatarUrl: null, coverUrl: null, bio: null }];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockServer(session: Session) {
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url === '/sports' || url === '/sports/profiles') data = [];
    else if (url.endsWith('/session-attribute-schema')) data = null;
    else if (url === '/users/friends') data = friends;
    else if (url === `/sessions/${session.id}`) data = session;
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
    data: { success: true, message: '', data: { sent: 1, skipped: 0 }, timestamp: '' },
  });
  return { get, post };
}

function failure(status: number, errorCode?: string) {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'prose', errorCode } } as AxiosResponse;
  return error;
}

const session = makeSession({ id: 5 });

beforeEach(() => {
  useAuthStore.setState({ user: caller, accessToken: 'token', isBootstrapping: false });
  useSessionErrorDialogStore.setState({ error: null, dismissals: 0, lastDismissedForbidden: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openDetail() {
  const hook = renderHook(() => useSessionDetailModalData(session.id), { wrapper });
  await waitFor(() => expect(hook.result.current.selectedSession).toBeDefined());
  return hook;
}

const friendCalls = (get: ReturnType<typeof mockServer>['get']) => get.mock.calls.filter(([url]) => url === '/users/friends');

describe('useSessionDetailModalData: the Share slice (CLIENT-SESSION-49)', () => {
  it('starts closed and fetches no friends until the dialog opens', async () => {
    const { get } = mockServer(session);
    const { result } = await openDetail();

    expect(result.current.share.isOpen).toBe(false);
    expect(result.current.share.friends).toEqual([]);
    expect(friendCalls(get)).toHaveLength(0);

    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.friends).toEqual(friends));
    expect(result.current.share.isOpen).toBe(true);
    expect(friendCalls(get)).toHaveLength(1);
  });

  it('onShare posts the ids to /sessions/{id}/shares and runs onDone on success', async () => {
    const { post } = mockServer(session);
    const { result } = await openDetail();
    const onDone = vi.fn();

    act(() => result.current.share.onShare(['u-alice'], onDone));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/sessions/5/shares', { userIds: ['u-alice'] });
    expect(result.current.share.isShareError).toBe(false);
  });

  it('an uncoded failure is an inline error: onDone is not called, and closing clears it', async () => {
    const { post } = mockServer(session);
    post.mockRejectedValue(failure(500));
    const { result } = await openDetail();
    const onDone = vi.fn();
    act(() => result.current.share.onOpen());

    act(() => result.current.share.onShare(['u-alice'], onDone));

    await waitFor(() => expect(result.current.share.isShareError).toBe(true));
    expect(onDone).not.toHaveBeenCalled();
    expect(useSessionErrorDialogStore.getState().error).toBeNull();

    act(() => result.current.share.onClose());
    expect(result.current.share.isOpen).toBe(false);
    expect(result.current.share.isShareError).toBe(false);
  });

  it.each([
    [404, 'SESSION_NOT_FOUND'],
    [403, 'SESSION_SHARE_NOT_ALLOWED'],
  ])('a %s %s opens the app-wide error dialog (no inline error), and dismissing it closes the Share dialog', async (status, code) => {
    const { post } = mockServer(session);
    post.mockRejectedValue(failure(status, code));
    const { result } = await openDetail();
    act(() => result.current.share.onOpen());

    act(() => result.current.share.onShare(['u-alice'], () => {}));

    await waitFor(() => expect(useSessionErrorDialogStore.getState().error).not.toBeNull());
    expect(result.current.share.isShareError).toBe(false);
    expect(result.current.share.isOpen).toBe(true);

    act(() => useSessionErrorDialogStore.getState().dismiss(false));
    await waitFor(() => expect(result.current.share.isOpen).toBe(false));
  });

  it('a dismissal of some other error leaves the Share dialog open', async () => {
    mockServer(session);
    const { result } = await openDetail();
    act(() => result.current.share.onOpen());

    act(() => useSessionErrorDialogStore.getState().dismiss(false));

    expect(result.current.share.isOpen).toBe(true);
  });

  it('resetActionErrors closes the dialog with the session it belongs to', async () => {
    mockServer(session);
    const { result } = await openDetail();
    act(() => result.current.share.onOpen());
    expect(result.current.share.isOpen).toBe(true);

    act(() => result.current.resetActionErrors());

    expect(result.current.share.isOpen).toBe(false);
  });
});
