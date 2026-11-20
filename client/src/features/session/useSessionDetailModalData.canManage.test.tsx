import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { Session } from '@/shared/types/session';
import { makeSession } from './components/sessionListFixtures';
import { useSessionDetailModalData } from './useSessionDetailModalData';

/**
 * CLIENT-GROUP-SESSION-1: who may manage a session in the detail (edit and schedule a draft, see the join-request queue,
 * cancel a group session). The host always does; a group session is also managed by the group's owner and admins (the
 * server's rule, GROUP_SESSION_DESIGN.md 4.3). A plain member who is not the host never does.
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The detail query answers `session`; the caller's groups answer one group (id 7) in which they hold `role`. */
function mockServer(session: Session, role: string | null) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url === '/sports' || url === '/sports/profiles') data = [];
    else if (url.endsWith('/session-attribute-schema')) data = null;
    else if (url === `/sessions/${session.id}`) data = session;
    else if (url === `/groups/user/${caller.id}`) data = { content: [{ id: 7, currentUserRole: role }] };
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
}

async function canManageFor(session: Session, role: string | null): Promise<boolean> {
  mockServer(session, role);
  const hook = renderHook(() => useSessionDetailModalData(session.id), { wrapper });
  await waitFor(() => expect(hook.result.current.selectedSession).toBeDefined());
  // The caller's groups arrive after the session; the rule is settled once that query has answered.
  await waitFor(() => expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(`/groups/user/${caller.id}`));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return hook.result.current.canManage;
}

beforeEach(() => {
  useAuthStore.setState({ user: caller, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSessionDetailModalData canManage (CLIENT-GROUP-SESSION-1)', () => {
  it('lets the host of a group session manage it even as a plain member', async () => {
    const session = makeSession({ id: 1, groupId: 7, createdBy: caller.id });
    expect(await canManageFor(session, 'group_member')).toBe(true);
  });

  it.each(['group_owner', 'group_admin'])('lets a group %s manage a session someone else hosts', async (role) => {
    const session = makeSession({ id: 2, groupId: 7, createdBy: 'someone-else' });
    expect(await canManageFor(session, role)).toBe(true);
  });

  it('does not let a plain member who is not the host manage a group session', async () => {
    const session = makeSession({ id: 3, groupId: 7, createdBy: 'someone-else' });
    expect(await canManageFor(session, 'group_member')).toBe(false);
  });

  it('keeps a standalone session to its creator', async () => {
    expect(await canManageFor(makeSession({ id: 4, groupId: null, createdBy: caller.id }), null)).toBe(true);
    expect(await canManageFor(makeSession({ id: 5, groupId: null, createdBy: 'someone-else' }), 'group_owner')).toBe(false);
  });

  it('does not let a group role from another group count', async () => {
    const session = makeSession({ id: 6, groupId: 99, createdBy: 'someone-else' });
    expect(await canManageFor(session, 'group_owner')).toBe(false);
  });
});
