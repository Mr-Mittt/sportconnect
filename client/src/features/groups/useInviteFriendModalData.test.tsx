import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupInvitation, GroupMember } from '@/features/feed/types';
import type { UserSearchResult } from '@/features/friends/types';
import { useInviteFriendModalData } from './useInviteFriendModalData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function pagedResponse<T>(content: T[]) {
  return apiResponse({
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 100,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  });
}

function searchUser(overrides: Partial<UserSearchResult>): UserSearchResult {
  return {
    id: 'user-1',
    fullName: 'Robin Alvarez',
    username: 'robin.a',
    avatarUrl: null,
    city: null,
    country: null,
    friendshipStatus: 'FRIENDS',
    ...overrides,
  };
}

function member(overrides: Partial<GroupMember>): GroupMember {
  return {
    id: 1,
    groupId: 1,
    userId: 'user-1',
    userFullName: 'Robin Alvarez',
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-06-01T00:00:00',
    ...overrides,
  };
}

function invitation(overrides: Partial<GroupInvitation>): GroupInvitation {
  return {
    id: 1,
    groupId: 1,
    groupName: 'Riverside Ballers',
    inviterId: 'me',
    inviterFullName: 'Ben Nyx',
    inviteeId: 'user-1',
    inviteeFullName: 'Robin Alvarez',
    status: 'pending_owner',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-07-20T00:00:00',
    updatedAt: '2026-07-20T00:00:00',
    ...overrides,
  };
}

function mockGet({
  search = [],
  members = [],
  sentInvitations = [],
}: {
  search?: UserSearchResult[];
  members?: GroupMember[];
  sentInvitations?: GroupInvitation[];
} = {}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/users/search') return pagedResponse(search);
    if (url === '/groups/1/members') return pagedResponse(members);
    if (url === '/groups/1/invitations/sent') return pagedResponse(sentInvitations);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useInviteFriendModalData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not fetch while isOpen is false', () => {
    const getSpy = mockGet();
    renderHook(() => useInviteFriendModalData(1, false, ''), { wrapper });
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('seeds inputValue from initialQuery on open and fires the search after the debounce', async () => {
    const getSpy = mockGet({ search: [searchUser({})] });

    const { result } = renderHook(() => useInviteFriendModalData(1, true, 'robin'), { wrapper });

    expect(result.current.inputValue).toBe('robin');
    await waitFor(
      () => expect(getSpy).toHaveBeenCalledWith('/users/search', { params: { q: 'robin' } }),
      { timeout: 2000 },
    );
  });

  it('does not query /users/search below the 2-character minimum', async () => {
    const getSpy = mockGet();

    renderHook(() => useInviteFriendModalData(1, true, 'r'), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getSpy).not.toHaveBeenCalledWith('/users/search', expect.anything());
  });

  it('drops non-friend search results entirely', async () => {
    mockGet({
      search: [
        searchUser({ id: 'user-1', fullName: 'Robin Alvarez', friendshipStatus: 'FRIENDS' }),
        searchUser({ id: 'user-2', fullName: 'Priya Shah', friendshipStatus: 'NONE' }),
        searchUser({ id: 'user-3', fullName: 'Jordan Lee', friendshipStatus: 'PENDING_SENT' }),
      ],
    });

    const { result } = renderHook(() => useInviteFriendModalData(1, true, 'ro'), { wrapper });

    await waitFor(() => expect(result.current.rows).toHaveLength(1), { timeout: 2000 });
    expect(result.current.rows[0].user.fullName).toBe('Robin Alvarez');
  });

  it('sorts already-member/already-invited friends to the end, invitable friends first', async () => {
    mockGet({
      search: [
        searchUser({ id: 'user-1', fullName: 'Already Member' }),
        searchUser({ id: 'user-2', fullName: 'Invitable Friend' }),
        searchUser({ id: 'user-3', fullName: 'Already Invited' }),
      ],
      members: [member({ userId: 'user-1' })],
      sentInvitations: [invitation({ inviteeId: 'user-3' })],
    });

    const { result } = renderHook(() => useInviteFriendModalData(1, true, 'friend'), { wrapper });

    await waitFor(() => expect(result.current.rows).toHaveLength(3), { timeout: 2000 });
    expect(result.current.rows.map((row) => row.user.fullName)).toEqual([
      'Invitable Friend',
      'Already Member',
      'Already Invited',
    ]);
    expect(result.current.rows.map((row) => row.action)).toEqual(['friend', 'member', 'invited']);
  });

  it('sendInvite POSTs the invitee id and marks the row as sending while in flight', async () => {
    mockGet({ search: [searchUser({ id: 'user-1' })] });
    let resolvePost!: (value: unknown) => void;
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));

    const { result } = renderHook(() => useInviteFriendModalData(1, true, 'ro'), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1), { timeout: 2000 });

    act(() => result.current.sendInvite('user-1'));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/groups/1/invitations', { inviteeId: 'user-1' }),
    );
    await waitFor(() => expect(result.current.rows[0].isSending).toBe(true));

    await act(async () => {
      resolvePost(apiResponse(invitation({ inviteeId: 'user-1' })));
    });
    await waitFor(() => expect(result.current.rows[0].isSending).toBe(false));
  });

  it('sets a per-row error on failure without affecting other rows', async () => {
    mockGet({
      search: [searchUser({ id: 'user-1', fullName: 'Robin' }), searchUser({ id: 'user-2', fullName: 'Priya' })],
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { success: false, message: 'You can only invite your friends', data: null, timestamp: '' } },
    });

    const { result } = renderHook(() => useInviteFriendModalData(1, true, 'ro'), { wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(2), { timeout: 2000 });

    await act(async () => result.current.sendInvite('user-1'));

    await waitFor(() =>
      expect(result.current.rows.find((row) => row.user.id === 'user-1')?.error).toBe(
        'You can only invite your friends',
      ),
    );
    expect(result.current.rows.find((row) => row.user.id === 'user-2')?.error).toBeNull();
  });
});
