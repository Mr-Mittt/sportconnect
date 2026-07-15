import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { Group, PageResponse } from '../types';
import { useCreateGroup } from './useCreateGroup';

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

describe('useCreateGroup', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /groups with the payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const created = group({ id: 9, groupName: 'New Group' });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreateGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.mutate({ sportId: 5, groupName: 'New Group', isPrivate: false }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/groups', {
      sportId: 5,
      groupName: 'New Group',
      isPrivate: false,
    });
  });

  it('prepends the new group into the userGroups cache immediately', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(feedKeys.userGroups('user-1'), page([group({ id: 1 })]));
    const created = group({ id: 9, groupName: 'New Group' });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreateGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.mutate({ sportId: 5, groupName: 'New Group', isPrivate: false }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<PageResponse<Group>>(feedKeys.userGroups('user-1'));
    expect(cached?.content[0]).toEqual(created);
    expect(cached?.content).toHaveLength(2);
  });

  it('invalidates feed queries on settle', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: group({ id: 9 }), timestamp: '' },
    });

    const { result } = renderHook(() => useCreateGroup('user-1'), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.mutate({ sportId: 5, groupName: 'New Group', isPrivate: false }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });
});
