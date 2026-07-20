import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Group, PageResponse } from '../types';
import { useUpdateGroup } from './useUpdateGroup';

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

describe('useUpdateGroup', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls PUT /groups/{groupId} with the partial payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = group({ id: 1, isPrivate: true });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { isPrivate: true } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/groups/1', { isPrivate: true });
  });

  it('patches the matching entry in the userGroups cache in place', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(
      feedKeys.userGroups('user-1'),
      page([group({ id: 1, isPrivate: false }), group({ id: 2 })]),
    );
    const updated = group({ id: 1, isPrivate: true });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { isPrivate: true } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<PageResponse<Group>>(feedKeys.userGroups('user-1'));
    expect(cached?.content.find((g) => g.id === 1)?.isPrivate).toBe(true);
    expect(cached?.content).toHaveLength(2);
  });
});
