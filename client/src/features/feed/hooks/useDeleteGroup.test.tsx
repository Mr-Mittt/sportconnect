import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useFeedSpaceStore } from '@/app/feedSpaceStore';
import { feedKeys } from '../queryKeys';
import type { Group, PageResponse } from '../types';
import { useDeleteGroup } from './useDeleteGroup';

function group(overrides: Partial<Group>): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    coverUrl: null,
    isPrivate: false,
    isActive: true,
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    memberCount: 1,
    currentUserRole: 'group_owner',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

function page<T>(content: T[]): PageResponse<T> {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDeleteGroup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useFeedSpaceStore.setState({ activeSport: 'all', selectedGroupId: null, selectedGroupSportId: null });
  });

  it('calls DELETE /groups/{groupId}', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: '', data: undefined, timestamp: '' },
    });

    const { result } = renderHook(() => useDeleteGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate(1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.delete).toHaveBeenCalledWith('/groups/1');
  });

  it('clears the selected group and drops it from the userGroups cache', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(feedKeys.userGroups('user-1'), page([group({ id: 1 }), group({ id: 2 })]));
    useFeedSpaceStore.setState({ selectedGroupId: 1 });
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: '', data: undefined, timestamp: '' },
    });

    const { result } = renderHook(() => useDeleteGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate(1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useFeedSpaceStore.getState().selectedGroupId).toBeNull();
    const cached = queryClient.getQueryData<PageResponse<Group>>(feedKeys.userGroups('user-1'));
    expect(cached?.content.map((g) => g.id)).toEqual([2]);
  });
});
