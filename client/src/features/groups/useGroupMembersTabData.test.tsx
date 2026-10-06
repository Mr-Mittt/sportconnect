import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupMember, JoinRequest, PageResponse } from '@/features/feed/types';
import { useGroupMembersTabData } from './useGroupMembersTabData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function membersPage(members: GroupMember[]): PageResponse<GroupMember> {
  return {
    content: members,
    totalPages: 1,
    totalElements: members.length,
    number: 0,
    size: 100,
    first: true,
    last: true,
    numberOfElements: members.length,
    empty: members.length === 0,
  };
}

const emptyPage = { content: [], totalPages: 1, totalElements: 0, number: 0, size: 100, first: true, last: true, numberOfElements: 0, empty: true };

describe('useGroupMembersTabData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('splits fetched members into administrators (owner first) and members', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/1/members') {
        return {
          data: {
            success: true,
            message: '',
            data: membersPage([
              { id: 1, groupId: 1, userId: 'u1', userFullName: 'Sam Ito', userAvatarUrl: null, roleId: 2, roleName: 'group_admin', roleLevel: 2, joinedAt: '2026-06-01T00:00:00' },
              { id: 2, groupId: 1, userId: 'u2', userFullName: 'Jordan Lee', userAvatarUrl: null, roleId: 1, roleName: 'group_owner', roleLevel: 3, joinedAt: '2026-06-01T00:00:00' },
              { id: 3, groupId: 1, userId: 'u3', userFullName: 'Alex Chen', userAvatarUrl: null, roleId: 3, roleName: 'group_member', roleLevel: 1, joinedAt: '2026-06-01T00:00:00' },
            ]),
            timestamp: '',
          },
        };
      }
      if (url === '/groups/1/invitations/sent') {
        return { data: { success: true, message: '', data: emptyPage, timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    // group_member — canManage is false, so join-requests/invitations must never fire.
    const { result } = renderHook(() => useGroupMembersTabData(1, true, 'group_member'), { wrapper });

    await waitFor(() => expect(result.current.isMembersLoading).toBe(false));
    expect(result.current.canManage).toBe(false);
    expect(result.current.administrators.map((m) => m.userFullName)).toEqual(['Jordan Lee', 'Sam Ito']);
    expect(result.current.members.map((m) => m.userFullName)).toEqual(['Alex Chen']);
    expect(apiClient.get).not.toHaveBeenCalledWith('/groups/1/join-requests', expect.anything());
    expect(apiClient.get).not.toHaveBeenCalledWith('/groups/1/invitations', expect.anything());
  });

  it('fetches join requests and group invitations only when canManage is true', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useGroupMembersTabData(1, true, 'group_owner'), { wrapper });

    await waitFor(() => expect(result.current.isMembersLoading).toBe(false));
    expect(result.current.canManage).toBe(true);
    expect(getSpy).toHaveBeenCalledWith('/groups/1/join-requests', { params: { size: 100 } });
    expect(getSpy).toHaveBeenCalledWith('/groups/1/invitations', { params: { size: 100 } });
  });

  it('hands a failed accept / cancel to onActionError and refetches the lists (CLIENT-ERR-5)', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });
    const failure = new AxiosError('conflict', 'ERR_BAD_REQUEST');
    failure.response = {
      status: 409,
      data: { success: false, message: 'x', errorCode: 'GROUP_JOIN_REQUEST_NOT_PENDING' },
    } as AxiosResponse;
    vi.spyOn(apiClient, 'put').mockRejectedValue(failure);
    vi.spyOn(apiClient, 'delete').mockRejectedValue(failure);
    const onActionError = vi.fn();

    const { result } = renderHook(
      () => useGroupMembersTabData(1, true, 'group_owner', onActionError),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isMembersLoading).toBe(false));
    const readsBefore = getSpy.mock.calls.length;

    result.current.acceptApprovalQueueItem({
      type: 'join_request',
      data: { id: 5 } as JoinRequest,
    });
    await waitFor(() => expect(onActionError).toHaveBeenCalledTimes(1));
    // TanStack also passes the variables and context after the error.
    expect(onActionError.mock.calls[0][0]).toBe(failure);
    result.current.cancelInvitation(9);
    await waitFor(() => expect(onActionError).toHaveBeenCalledTimes(2));
    expect(onActionError.mock.calls[1][0]).toBe(failure);
    // onSettled invalidates, so the stale row is re-read from the server.
    await waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(readsBefore));
  });

  it('does not fetch anything while inactive', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    renderHook(() => useGroupMembersTabData(1, false, 'group_owner'), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('merges join requests and group invitations into one queue, sorted oldest-first', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/1/members') {
        return { data: { success: true, message: '', data: membersPage([]), timestamp: '' } };
      }
      if (url === '/groups/1/join-requests') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              ...emptyPage,
              content: [
                {
                  id: 1,
                  groupId: 1,
                  groupName: 'Test Group',
                  userId: 'u1',
                  userFullName: 'Priya Shah',
                  userAvatarUrl: null,
                  status: 'pending',
                  message: null,
                  reviewedBy: null,
                  reviewedByFullName: null,
                  reviewedAt: null,
                  createdAt: '2026-07-20T00:00:00',
                  updatedAt: '2026-07-20T00:00:00',
                },
              ],
            },
            timestamp: '',
          },
        };
      }
      if (url === '/groups/1/invitations') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              ...emptyPage,
              content: [
                {
                  id: 2,
                  groupId: 1,
                  groupName: 'Test Group',
                  inviterId: 'u2',
                  inviterFullName: 'Sam Ito',
                  inviteeId: 'u3',
                  inviteeFullName: 'Morgan Diaz',
                  status: 'pending_owner',
                  reviewedBy: null,
                  reviewedAt: null,
                  createdAt: '2026-07-18T00:00:00',
                  updatedAt: '2026-07-18T00:00:00',
                },
              ],
            },
            timestamp: '',
          },
        };
      }
      if (url === '/groups/1/invitations/sent') {
        return { data: { success: true, message: '', data: emptyPage, timestamp: '' } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useGroupMembersTabData(1, true, 'group_owner'), { wrapper });

    await waitFor(() => expect(result.current.isApprovalQueueLoading).toBe(false));
    // The invitation (2026-07-18) predates the join request (2026-07-20) —
    // oldest-first means the invitation comes first despite join requests
    // being fetched second above.
    expect(result.current.approvalQueue).toEqual([
      { type: 'invitation', data: expect.objectContaining({ id: 2, inviteeFullName: 'Morgan Diaz' }) },
      { type: 'join_request', data: expect.objectContaining({ id: 1, userFullName: 'Priya Shah' }) },
    ]);
  });
});
