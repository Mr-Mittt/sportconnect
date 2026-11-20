import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import { GROUP_MEMBERS_PAGE_SIZE, useGroupMembersPages } from './useGroupMembersPages';

/** CLIENT-GROUP-SESSION-3: the group Share dialog's member list, 100 at a time. */

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function member(id: number) {
  return {
    id,
    groupId: 5,
    userId: `u-${id}`,
    userFullName: `Member ${id}`,
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-01-01T00:00:00',
  };
}

function serve(pages: { content: unknown[]; last: boolean }[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (_url: string, config?: { params?: { page?: number } }) => {
    const page = config?.params?.page ?? 0;
    return { data: { success: true, message: '', data: { ...pages[page], number: page }, timestamp: '' } };
  });
}

afterEach(() => vi.restoreAllMocks());

describe('useGroupMembersPages', () => {
  it('asks for the first page of 100 of the group members', async () => {
    const get = serve([{ content: [member(1)], last: true }]);
    renderHook(() => useGroupMembersPages(5, true), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(GROUP_MEMBERS_PAGE_SIZE).toBe(100);
    expect(get).toHaveBeenCalledWith('/groups/5/members', { params: { page: 0, size: 100 } });
  });

  it('fetchNextPage asks for the next page number and appends it; there is no next page after the last', async () => {
    const get = serve([
      { content: [member(1)], last: false },
      { content: [member(2)], last: true },
    ]);
    const { result } = renderHook(() => useGroupMembersPages(5, true), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(get).toHaveBeenLastCalledWith('/groups/5/members', { params: { page: 1, size: 100 } });
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((page) => page.content.map((m) => m.userId))).toEqual(['u-1', 'u-2']),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it('asks nothing while disabled or without a group', async () => {
    const get = serve([{ content: [], last: true }]);
    renderHook(() => useGroupMembersPages(5, false), { wrapper });
    renderHook(() => useGroupMembersPages(undefined, true), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).not.toHaveBeenCalled();
  });

  it('its key sits under the group members key, so a member change that refreshes that key refreshes the pages too', () => {
    expect(feedKeys.groupMembersPages(5).slice(0, feedKeys.groupMembers(5).length)).toEqual([...feedKeys.groupMembers(5)]);
  });
});
