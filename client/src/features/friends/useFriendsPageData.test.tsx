import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useFriendsPageStore } from '@/app/friendsPageStore';
import type { User } from '@/features/auth/types';
import type { FriendRequest, FriendUser, UserSearchResult } from './types';
import { useFriendsPageData } from './useFriendsPageData';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const mockUser: User = {
  id: 'me',
  email: 'ben@example.com',
  firstName: 'Ben',
  lastName: 'Nyx',
  username: 'bennyx',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function pagedResponse<T>(content: T[]) {
  return apiResponse({
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  });
}

const priya: FriendUser = { id: 'f1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null };
const hana: FriendUser = { id: 'f3', fullName: 'Hana Kim', avatarUrl: null, coverUrl: null, bio: null };

const receivedRequest: FriendRequest = {
  requestId: 'req-1',
  senderId: 'f3',
  senderName: 'Hana Kim',
  receiverId: 'me',
  receiverName: 'Ben Nyx',
  status: 'PENDING',
  createdAt: '2026-07-20T00:00:00',
};

const sentRequest: FriendRequest = {
  requestId: 'req-2',
  senderId: 'me',
  senderName: 'Ben Nyx',
  receiverId: 'f4',
  receiverName: 'Diego Alvarez',
  status: 'PENDING',
  createdAt: '2026-07-20T00:00:00',
};

function mockGet({
  friends = [priya],
  received = [receivedRequest],
  sent = [sentRequest],
  profiles = {},
  search = [],
}: {
  friends?: FriendUser[];
  received?: FriendRequest[];
  sent?: FriendRequest[];
  profiles?: Record<string, FriendUser>;
  search?: UserSearchResult[];
} = {}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/users/friends') return apiResponse(friends);
    if (url === '/users/friends/requests/received') return apiResponse(received);
    if (url === '/users/friends/requests/sent') return apiResponse(sent);
    if (url === '/users/search') {
      const keyword = config?.params?.q as string;
      return pagedResponse(search.filter((result) => result.fullName.toLowerCase().includes(keyword.toLowerCase())));
    }
    if (url.startsWith('/sports/profiles/user/')) return apiResponse([]);
    if (url.startsWith('/users/')) {
      const userId = url.replace('/users/', '');
      const profile = profiles[userId];
      if (profile) return apiResponse(profile);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('useFriendsPageData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: mockUser, accessToken: 'token', isBootstrapping: false });
    useFriendsPageStore.setState({ query: '', isAddMode: false, selectedPersonId: undefined });
  });

  it('resolves a friend-list selection to FRIENDS without calling GET /users/{id}', async () => {
    const getSpy = mockGet();
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.selectPerson('f1'));

    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('FRIENDS'));
    expect(result.current.selectedPerson?.fullName).toBe('Priya Shah');
    expect(getSpy).not.toHaveBeenCalledWith('/users/f1');
  });

  it('resolves a selection found in received requests to PENDING_RECEIVED with the real requestId', async () => {
    mockGet({ friends: [priya], profiles: { f3: hana } });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.selectPerson('f3'));

    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('PENDING_RECEIVED'));
    expect(result.current.selectedPerson?.requestId).toBe('req-1');
  });

  it('resolves a selection found in sent requests to PENDING_SENT', async () => {
    mockGet({ friends: [priya], profiles: { f4: { id: 'f4', fullName: 'Diego Alvarez', avatarUrl: null, coverUrl: null, bio: null } } });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.selectPerson('f4'));

    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('PENDING_SENT'));
    expect(result.current.selectedPerson?.requestId).toBe(null);
  });

  it('falls back to the search result\'s own friendshipStatus for a fresh directory selection', async () => {
    const searchResult: UserSearchResult = {
      id: 'u1',
      fullName: 'Owen Clarke',
      username: 'owenc',
      avatarUrl: null,
      city: null,
      country: null,
      friendshipStatus: 'NONE',
    };
    mockGet({
      friends: [priya],
      search: [searchResult],
      profiles: { u1: { id: 'u1', fullName: 'Owen Clarke', avatarUrl: null, coverUrl: null, bio: null } },
    });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.toggleAddMode());
    act(() => result.current.setQuery('Owen'));

    await waitFor(() => expect(result.current.searchResults).toHaveLength(1), { timeout: 2000 });
    act(() => result.current.selectPerson('u1'));

    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('NONE'));
  });

  it('does not query U6 below the 2-character minimum, even in Add mode', async () => {
    const getSpy = mockGet();
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.toggleAddMode());
    act(() => result.current.setQuery('a'));

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getSpy).not.toHaveBeenCalledWith('/users/search', expect.anything());
  });

  it('clearing the query exits Add mode', async () => {
    mockGet();
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.toggleAddMode());
    act(() => result.current.setQuery('Owen'));
    expect(result.current.isAddMode).toBe(true);

    act(() => result.current.clearQuery());
    expect(result.current.isAddMode).toBe(false);
    expect(result.current.query).toBe('');
  });

  it('declining a request clears the selection on success', async () => {
    mockGet({ friends: [priya], profiles: { f3: hana } });
    vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(undefined));
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    act(() => result.current.selectPerson('f3'));
    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('PENDING_RECEIVED'));

    act(() => result.current.declineRequest('req-1'));

    await waitFor(() => expect(result.current.selectedPersonId).toBeUndefined());
  });

  it('filters the Offline section and Friend Requests section by the rail search, case-insensitively', async () => {
    mockGet({ friends: [priya, hana] });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.isFriendsLoading).toBe(false));
    expect(result.current.offlineFriends).toHaveLength(2);

    act(() => result.current.setQuery('priya'));
    expect(result.current.offlineFriends.map((f) => f.fullName)).toEqual(['Priya Shah']);
    expect(result.current.friendRequestRows.map((r) => r.name)).toEqual([]);
  });

  // User-requested: leaving the Friends page and coming back restores mode/
  // search text/selection; a restored selection that's no longer in any
  // reloaded list clears back to "no selection" instead of lingering.
  it('restores a persisted query/Add-mode/selection on a fresh mount (simulates returning to the page)', async () => {
    useFriendsPageStore.setState({ query: 'priya', isAddMode: false, selectedPersonId: 'f1' });
    mockGet();
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    expect(result.current.query).toBe('priya');
    expect(result.current.isAddMode).toBe(false);
    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('FRIENDS'));
    expect(result.current.selectedPerson?.fullName).toBe('Priya Shah');
  });

  it('clears a restored selection that no longer resolves to anyone once the reloaded lists settle', async () => {
    // f9 was presumably a friend/pending request last visit — none of the
    // reloaded lists include it this time (e.g. unfriended, or the request
    // was resolved elsewhere).
    useFriendsPageStore.setState({ query: '', isAddMode: false, selectedPersonId: 'f9' });
    mockGet({ friends: [priya] });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.selectedPersonId).toBeUndefined());
    expect(result.current.selectedPerson).toBeUndefined();
  });

  // CLIENT-NOTIF-5: focusPersonId — the "select this person on arrival" intent a
  // clicked friend-request notification carries through from router state.
  it('pre-selects focusPersonId when it resolves to someone in the request lists, no focusUnavailable dialog', async () => {
    mockGet({ friends: [priya], received: [receivedRequest], profiles: { f3: hana } });
    const { result } = renderHook(() => useFriendsPageData('f3'), { wrapper });

    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('PENDING_RECEIVED'));
    expect(result.current.selectedPerson?.requestId).toBe('req-1');
    expect(result.current.focusUnavailable).toBe(false);
  });

  it('raises focusUnavailable (and selects nobody) when focusPersonId is in none of the lists — request cancelled or account gone', async () => {
    mockGet({ friends: [priya], received: [], sent: [] });
    const { result } = renderHook(() => useFriendsPageData('ghost'), { wrapper });

    await waitFor(() => expect(result.current.focusUnavailable).toBe(true));
    expect(result.current.selectedPersonId).toBeUndefined();
    expect(result.current.selectedPerson).toBeUndefined();
  });

  it('a plain stale restored selection still clears silently — no focusUnavailable dialog when there was no focus intent', async () => {
    useFriendsPageStore.setState({ query: '', isAddMode: false, selectedPersonId: 'f9' });
    mockGet({ friends: [priya], received: [], sent: [] });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.selectedPersonId).toBeUndefined());
    expect(result.current.focusUnavailable).toBe(false);
  });

  it('focusUnavailable derives back to false once the focus intent is dropped (FriendsPage clears the router state)', async () => {
    mockGet({ friends: [priya], received: [], sent: [] });
    const { result, rerender } = renderHook(({ focus }: { focus?: string }) => useFriendsPageData(focus), {
      wrapper,
      initialProps: { focus: 'ghost' } as { focus?: string },
    });

    await waitFor(() => expect(result.current.focusUnavailable).toBe(true));

    rerender({ focus: undefined });
    expect(result.current.focusUnavailable).toBe(false);
  });

  it('keeps a restored Add-mode search selection once the re-run search confirms it\'s still there', async () => {
    const searchResult: UserSearchResult = {
      id: 'u1',
      fullName: 'Owen Clarke',
      username: 'owenc',
      avatarUrl: null,
      city: null,
      country: null,
      friendshipStatus: 'NONE',
    };
    useFriendsPageStore.setState({ query: 'Owen', isAddMode: true, selectedPersonId: 'u1' });
    mockGet({
      search: [searchResult],
      profiles: { u1: { id: 'u1', fullName: 'Owen Clarke', avatarUrl: null, coverUrl: null, bio: null } },
    });
    const { result } = renderHook(() => useFriendsPageData(), { wrapper });

    await waitFor(() => expect(result.current.searchResults).toHaveLength(1), { timeout: 2000 });
    await waitFor(() => expect(result.current.selectedPerson?.friendshipStatus).toBe('NONE'));
    expect(result.current.selectedPersonId).toBe('u1');
  });
});
