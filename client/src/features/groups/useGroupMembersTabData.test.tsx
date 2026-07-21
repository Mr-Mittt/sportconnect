import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupMember, PageResponse } from '@/features/feed/types';
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

    // group_member — canManage is false, so join-requests must never fire.
    const { result } = renderHook(() => useGroupMembersTabData(1, true, 'group_member'), { wrapper });

    await waitFor(() => expect(result.current.isMembersLoading).toBe(false));
    expect(result.current.canManage).toBe(false);
    expect(result.current.administrators.map((m) => m.userFullName)).toEqual(['Jordan Lee', 'Sam Ito']);
    expect(result.current.members.map((m) => m.userFullName)).toEqual(['Alex Chen']);
    expect(apiClient.get).not.toHaveBeenCalledWith('/groups/1/join-requests', expect.anything());
  });

  it('fetches join requests only when canManage is true', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useGroupMembersTabData(1, true, 'group_owner'), { wrapper });

    await waitFor(() => expect(result.current.isMembersLoading).toBe(false));
    expect(result.current.canManage).toBe(true);
    expect(getSpy).toHaveBeenCalledWith('/groups/1/join-requests', { params: { size: 100 } });
  });

  it('does not fetch anything while inactive', () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    renderHook(() => useGroupMembersTabData(1, false, 'group_owner'), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });
});
