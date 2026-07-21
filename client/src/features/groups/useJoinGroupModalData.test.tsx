import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupSearchResult, JoinRequest, PageResponse } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
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

const football: SportProfile = { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' };
const tennis: SportProfile = { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' };
const sportProfiles = [football, tennis];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiResponse = <T,>(data: T) => ({ data: { success: true, message: '', data, timestamp: '' } });

async function noRequests(url: string) {
  if (url === '/groups/join-requests/user/user-1') return apiResponse(page([]));
  throw new Error(`unexpected GET ${url}`);
}

describe('useJoinGroupModalData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not fetch while isOpen is false', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useJoinGroupModalData('user-1', null, sportProfiles, false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not query /groups/public while the search input is empty, even when open (GRP-6)', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') throw new Error('should not be called with an empty keyword');
      return noRequests(url);
    });

    renderHook(() => useJoinGroupModalData('user-1', null, sportProfiles, true), { wrapper });

    await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/groups/join-requests/user/user-1'));
    expect(getSpy).not.toHaveBeenCalledWith('/groups/public', expect.anything());
  });

  it('seeds every one of the user\'s sports as selected when no sport is locked', () => {
    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );
    expect(result.current.selectedSports).toEqual(new Set(['football', 'tennis']));
  });

  it('seeds only the locked sport as selected when the page has an active sport tab', () => {
    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', 'tennis', sportProfiles, true),
      { wrapper },
    );
    expect(result.current.selectedSports).toEqual(new Set(['tennis']));
  });

  it('toggleSport adds and removes a sport from the selection', () => {
    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', 'tennis', sportProfiles, true),
      { wrapper },
    );
    expect(result.current.selectedSports).toEqual(new Set(['tennis']));

    act(() => result.current.toggleSport('football'));
    expect(result.current.selectedSports).toEqual(new Set(['tennis', 'football']));

    act(() => result.current.toggleSport('tennis'));
    expect(result.current.selectedSports).toEqual(new Set(['football']));
  });

  it('submitSearch commits inputValue and queries with the selected sportIds', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([]));
      return noRequests(url);
    });

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', 'tennis', sportProfiles, true),
      { wrapper },
    );

    act(() => result.current.setInputValue('ballers'));
    act(() => result.current.submitSearch());

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/groups/public', {
        params: { sportIds: [2], keyword: 'ballers' },
      }),
    );
  });

  it('openSearch sets inputValue and issues an immediate query (GRP-1)', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') return apiResponse(page([]));
      return noRequests(url);
    });

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );

    act(() => result.current.openSearch('  Riverside Ballers  '));

    expect(result.current.inputValue).toBe('  Riverside Ballers  ');
    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/groups/public', {
        params: { sportIds: [5, 2], keyword: 'Riverside Ballers' },
      }),
    );
  });

  it('openSearch with an empty string sets inputValue but issues no query', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(noRequests);

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );

    act(() => result.current.openSearch(''));

    expect(result.current.inputValue).toBe('');
    expect(getSpy).not.toHaveBeenCalledWith('/groups/public', expect.anything());
  });

  it('groups search results by sport, in filter-pill order', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/public') {
        return apiResponse(
          page([
            searchResult({ id: 1, sportId: 2, groupName: 'Tennis Club' }),
            searchResult({ id: 2, sportId: 5, groupName: 'Riverside Ballers' }),
            searchResult({ id: 3, sportId: 5, groupName: 'FC Weekend Warriors' }),
          ]),
        );
      }
      return noRequests(url);
    });

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );

    act(() => result.current.openSearch('club'));

    await waitFor(() => expect(result.current.groupedResults).toHaveLength(2));
    expect(result.current.groupedResults[0].sportKey).toBe('football');
    expect(result.current.groupedResults[0].results.map((r) => r.groupName)).toEqual([
      'Riverside Ballers',
      'FC Weekend Warriors',
    ]);
    expect(result.current.groupedResults[1].sportKey).toBe('tennis');
    expect(result.current.groupedResults[1].results.map((r) => r.groupName)).toEqual(['Tennis Club']);
  });

  it('pendingGroupIds reflects the user\'s pending join requests', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/join-requests/user/user-1')
        return apiResponse(page([joinRequest({ groupId: 7 })]));
      throw new Error(`unexpected GET ${url}`);
    });

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.pendingGroupIds.has(7)).toBe(true));
  });

  it('requestToJoin calls POST /groups/join-requests with the group name', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(noRequests);
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(apiResponse(joinRequest({})));

    const { result } = renderHook(
      () => useJoinGroupModalData('user-1', null, sportProfiles, true),
      { wrapper },
    );

    act(() => result.current.requestToJoin('Riverside Ballers'));

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/groups/join-requests', { groupName: 'Riverside Ballers' }),
    );
  });
});
