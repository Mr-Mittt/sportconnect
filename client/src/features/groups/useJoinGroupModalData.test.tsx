import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupSearchResult, JoinRequest, PageResponse } from '@/features/feed/types';
import { useJoinGroupModalData } from './useJoinGroupModalData';

function searchResult(overrides: Partial<GroupSearchResult>): GroupSearchResult {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    memberCount: 12,
    createdByFullName: 'Priya Shah',
    isMember: false,
    ...overrides,
  };
}

function joinRequest(overrides: Partial<JoinRequest>): JoinRequest {
  return {
    id: 1,
    groupId: 1,
    groupName: 'Riverside Ballers',
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    status: 'pending',
    message: null,
    reviewedBy: null,
    reviewedByFullName: null,
    reviewedAt: null,
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiResponse = <T,>(data: T) => ({ data: { success: true, message: '', data, timestamp: '' } });

describe('useJoinGroupModalData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not fetch while isOpen is false', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useJoinGroupModalData('user-1', undefined, false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('exposes search results once opened', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([searchResult({})]));
      if (url === '/groups/join-requests/user/user-1') return apiResponse(page([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useJoinGroupModalData('user-1', undefined, true), { wrapper });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.isSearching).toBe(false);
  });

  it('submitSearch commits inputValue to the query keyword', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([]));
      if (url === '/groups/join-requests/user/user-1') return apiResponse(page([]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useJoinGroupModalData('user-1', undefined, true), { wrapper });
    await waitFor(() => expect(result.current.isSearching).toBe(false));

    act(() => result.current.setInputValue('ballers'));
    act(() => result.current.submitSearch());

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/groups/public', { params: { keyword: 'ballers' } }),
    );
  });

  it('pendingGroupIds reflects the user\'s pending join requests', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([]));
      if (url === '/groups/join-requests/user/user-1')
        return apiResponse(page([joinRequest({ groupId: 7 })]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(() => useJoinGroupModalData('user-1', undefined, true), { wrapper });

    await waitFor(() => expect(result.current.pendingGroupIds.has(7)).toBe(true));
  });

  it('requestToJoin calls POST /groups/join-requests with the group name', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([]));
      if (url === '/groups/join-requests/user/user-1') return apiResponse(page([]));
      throw new Error(`unexpected GET ${url}`);
    });
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(joinRequest({})));

    const { result } = renderHook(() => useJoinGroupModalData('user-1', undefined, true), { wrapper });
    await waitFor(() => expect(result.current.isSearching).toBe(false));

    act(() => result.current.requestToJoin('Riverside Ballers'));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/groups/join-requests', { groupName: 'Riverside Ballers' }),
    );
  });
});
