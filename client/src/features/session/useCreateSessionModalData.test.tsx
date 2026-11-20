import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { makeSession } from './components/sessionListFixtures';
import type { CreateSessionPayload } from './types';
import { useCreateSessionModalData } from './useCreateSessionModalData';

/**
 * CLIENT-GROUP-SESSION-1: what the create form's data hook does when a session has been created. A group session is handed to
 * `onGroupSessionCreated` (the page opens its detail); a standalone one is not.
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

const group = { id: 5, sportId: 2, name: 'Saigon Tennis Club' };

const payload: CreateSessionPayload = {
  title: 'Evening play',
  scheduledStart: '2026-12-01T19:00:00+07:00',
  capacity: 9999,
  gameMood: 5,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockServer(created: ReturnType<typeof makeSession>) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    const data = url === '/sports' || url === '/sports/profiles' ? [] : { content: [] };
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
  return vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, message: '', data: created, timestamp: '' } });
}

beforeEach(() => {
  useAuthStore.setState({ user: caller, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => vi.restoreAllMocks());

describe('useCreateSessionModalData: after a successful create (CLIENT-GROUP-SESSION-1)', () => {
  it('hands a new group session to onGroupSessionCreated and closes the form', async () => {
    const created = makeSession({ id: 77, groupId: 5 });
    const post = mockServer(created);
    const onGroupSessionCreated = vi.fn();
    const { result } = renderHook(() => useCreateSessionModalData({ onGroupSessionCreated }), { wrapper });

    act(() => result.current.openCreateGroupSessionModal(group));
    expect(result.current.isCreateModalOpen).toBe(true);
    expect(result.current.createGroup).toEqual(group);
    act(() => result.current.submitCreate({ ...payload, groupId: 5 }));

    await waitFor(() => expect(onGroupSessionCreated).toHaveBeenCalledTimes(1));
    expect(onGroupSessionCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
    expect(post).toHaveBeenCalledWith('/sessions', expect.objectContaining({ groupId: 5 }));
    await waitFor(() => expect(result.current.isCreateModalOpen).toBe(false));
    expect(result.current.createGroup).toBeNull();
  });

  it('does not call it for a standalone session, which still just closes the form', async () => {
    const post = mockServer(makeSession({ id: 78, groupId: null }));
    const onGroupSessionCreated = vi.fn();
    const { result } = renderHook(() => useCreateSessionModalData({ onGroupSessionCreated }), { wrapper });

    act(() => result.current.openCreateModal());
    act(() => result.current.submitCreate({ ...payload, sportId: 2 }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isCreateModalOpen).toBe(false));
    expect(onGroupSessionCreated).not.toHaveBeenCalled();
  });

  it('works without a callback', async () => {
    const post = mockServer(makeSession({ id: 79, groupId: 5 }));
    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });
    act(() => result.current.openCreateGroupSessionModal(group));
    act(() => result.current.submitCreate({ ...payload, groupId: 5 }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isCreateModalOpen).toBe(false));
  });

  it('keeps the form open and calls nothing when the create fails', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const data = url === '/sports' || url === '/sports/profiles' ? [] : { content: [] };
      return { data: { success: true, message: '', data, timestamp: '' } };
    });
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('boom'));
    const onGroupSessionCreated = vi.fn();
    const { result } = renderHook(() => useCreateSessionModalData({ onGroupSessionCreated }), { wrapper });
    act(() => result.current.openCreateGroupSessionModal(group));
    act(() => result.current.submitCreate({ ...payload, groupId: 5 }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isCreateError).toBe(true));
    expect(onGroupSessionCreated).not.toHaveBeenCalled();
    expect(result.current.isCreateModalOpen).toBe(true);
  });
});
