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
const friendPeople = [{ id: 'u-alice', fullName: 'Alice Nguyen', avatarUrl: null }];

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
    expect(result.current.share.people).toEqual([]);
    expect(result.current.share.kind).toBe('friends');
    expect(friendCalls(get)).toHaveLength(0);

    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.people).toEqual(friendPeople));
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

// CLIENT-GROUP-SESSION-3: a group session is shared with the group's members, 100 at a time, never with friends.
describe('useSessionDetailModalData: the Share slice of a group session (CLIENT-GROUP-SESSION-3)', () => {
  const groupSession = makeSession({ id: 7, groupId: 5, sessionType: 'GROUP_RECURRING', isPublic: false });

  const member = (id: string, name: string) => ({
    id: Number(id.replace(/\D/g, '')) || 1,
    groupId: 5,
    userId: id,
    userFullName: name,
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-01-01T00:00:00',
  });

  function mockGroupServer(pages: Record<number, { content: unknown[]; last: boolean }>) {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
      let data: unknown = { content: [] };
      if (url === '/sports' || url === '/sports/profiles') data = [];
      else if (url.endsWith('/session-attribute-schema')) data = null;
      else if (url === '/users/friends') data = friends;
      else if (url === `/sessions/${groupSession.id}`) data = groupSession;
      else if (url === '/groups/5/members') {
        const page = config?.params?.page ?? 0;
        data = { ...pages[page], number: page, totalPages: 2, totalElements: 3, size: 100, first: page === 0, numberOfElements: pages[page].content.length, empty: false };
      }
      return { data: { success: true, message: '', data, timestamp: '' } };
    });
    return get;
  }

  async function openGroupDetail() {
    const hook = renderHook(() => useSessionDetailModalData(groupSession.id), { wrapper });
    await waitFor(() => expect(hook.result.current.selectedSession).toBeDefined());
    return hook;
  }

  const calls = (get: ReturnType<typeof mockGroupServer>, url: string) => get.mock.calls.filter(([u]) => u === url);

  it('asks for no one until the dialog opens, then loads the first page of 100 members and not the friends', async () => {
    const get = mockGroupServer({ 0: { content: [member('u-bao', 'Bảo Trần')], last: true } });
    const { result } = await openGroupDetail();
    expect(result.current.share.kind).toBe('group');
    expect(calls(get, '/groups/5/members')).toHaveLength(0);

    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.people).toHaveLength(1));
    expect(calls(get, '/groups/5/members')[0]).toEqual(['/groups/5/members', { params: { page: 0, size: 100 } }]);
    expect(calls(get, '/users/friends')).toHaveLength(0);
    expect(result.current.share.people[0]).toEqual({ id: 'u-bao', fullName: 'Bảo Trần', avatarUrl: null });
  });

  it('never lists the caller among the members', async () => {
    mockGroupServer({ 0: { content: [member(caller.id, 'Jordan Lee'), member('u-bao', 'Bảo Trần')], last: true } });
    const { result } = await openGroupDetail();
    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.people).toHaveLength(1));
    expect(result.current.share.people.map((person) => person.id)).toEqual(['u-bao']);
  });

  it('"Load more" fetches the next page and appends it; hasMore follows the last page', async () => {
    const get = mockGroupServer({
      0: { content: [member('u-bao', 'Bảo Trần')], last: false },
      1: { content: [member('u-chi', 'Chi Pham')], last: true },
    });
    const { result } = await openGroupDetail();
    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.people).toHaveLength(1));
    expect(result.current.share.hasMore).toBe(true);

    act(() => result.current.share.onLoadMore());
    await waitFor(() => expect(result.current.share.people).toHaveLength(2));
    expect(calls(get, '/groups/5/members')[1]).toEqual(['/groups/5/members', { params: { page: 1, size: 100 } }]);
    expect(result.current.share.people.map((person) => person.id)).toEqual(['u-bao', 'u-chi']);
    expect(result.current.share.hasMore).toBe(false);
  });

  it('a failed members load is reported', async () => {
    const get = mockGroupServer({ 0: { content: [], last: true } });
    get.mockImplementation(async (url: string) => {
      if (url === '/groups/5/members') throw failure(500);
      let data: unknown = { content: [] };
      if (url === '/sports' || url === '/sports/profiles') data = [];
      else if (url.endsWith('/session-attribute-schema')) data = null;
      else if (url === `/sessions/${groupSession.id}`) data = groupSession;
      return { data: { success: true, message: '', data, timestamp: '' } };
    });
    const { result } = await openGroupDetail();
    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.isPeopleError).toBe(true));
  });

  it('a standalone session still loads the friends and has no Load more', async () => {
    const { get } = mockServer(session);
    const { result } = await openDetail();
    act(() => result.current.share.onOpen());
    await waitFor(() => expect(result.current.share.people).toEqual(friendPeople));
    expect(result.current.share.kind).toBe('friends');
    expect(result.current.share.hasMore).toBe(false);
    expect(get.mock.calls.filter(([url]) => url === '/groups/5/members')).toHaveLength(0);
  });
});
