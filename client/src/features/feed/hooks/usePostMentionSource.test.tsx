import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { usePostMentionSource } from './usePostMentionSource';

// CLIENT-GL-50 part 2: who an `@` tags in a post box and its comments: friends for a user post, the group's members
// (B23 search) for a group post.

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const friend = (id: string, fullName: string) => ({ id, fullName, avatarUrl: null, coverUrl: null, bio: null });
const FRIENDS = [
  friend('f1', 'Tuấn Anh'),
  friend('f2', 'Bao Le'),
  friend('f3', 'Bao Tran'),
  friend('f4', 'Chi Pham'),
  friend('f5', 'Dung Vo'),
  friend('f6', 'Em Do'),
  friend('f7', 'Giang Ho'),
];

function envelope<T>(data: T) {
  return { data: { success: true, message: '', timestamp: '', data } };
}

function serve(members: { userId: string; fullName: string; avatarUrl: string | null }[] = []) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/users/friends') return envelope(FRIENDS);
    if (url === '/groups/5/members/search') return envelope(members);
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('usePostMentionSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('a user post offers friends, filtered by the shared name rule, and asks no group', async () => {
    const get = serve();
    const { result } = renderHook(() => usePostMentionSource(null), { wrapper: setup() });
    expect(result.current.options).toEqual([]);

    act(() => result.current.onQueryChange('tuan'));
    await waitFor(() => expect(result.current.options.map((o) => o.name)).toEqual(['Tuấn Anh']));
    expect(get).toHaveBeenCalledWith('/users/friends');
    expect(get).not.toHaveBeenCalledWith('/groups/5/members/search', expect.anything());
    expect(result.current.options[0]).toMatchObject({ id: 'f1', label: 'Tuấn Anh' });
  });

  it('friends have no minimum length: an empty @ word lists the first five, a word-start match only', async () => {
    serve();
    const { result } = renderHook(() => usePostMentionSource(null), { wrapper: setup() });
    act(() => result.current.onQueryChange(''));
    await waitFor(() => expect(result.current.options).toHaveLength(5));

    act(() => result.current.onQueryChange('ao'));
    await waitFor(() => expect(result.current.options).toEqual([]));
  });

  it('a group post offers the members the server search returns, after the debounce, and never loads friends', async () => {
    const get = serve([{ userId: 'm1', fullName: 'Bao Le', avatarUrl: 'a.png' }]);
    const { result } = renderHook(() => usePostMentionSource(5), { wrapper: setup() });

    act(() => result.current.onQueryChange('ba'));
    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(get).toHaveBeenCalledWith('/groups/5/members/search', { params: { q: 'ba', size: 6 } });
    expect(get).not.toHaveBeenCalledWith('/users/friends');
    expect(result.current.options[0]).toEqual({ id: 'm1', name: 'Bao Le', label: 'Bao Le', avatarUrl: 'a.png' });
  });

  it('asks nothing and offers nothing while no @ word is typed, or while the source is not enabled', async () => {
    const get = serve([{ userId: 'm1', fullName: 'Bao Le', avatarUrl: null }]);
    const idle = renderHook(() => usePostMentionSource(5), { wrapper: setup() });
    expect(idle.result.current.options).toEqual([]);
    const off = renderHook(() => usePostMentionSource(5, false), { wrapper: setup() });
    act(() => off.result.current.onQueryChange('ba'));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(off.result.current.options).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('a group list is dropped when the @ word ends, and a failed next search shows no list, not the last one', async () => {
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce(envelope([{ userId: 'm1', fullName: 'Bao Le', avatarUrl: null }]))
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePostMentionSource(5), { wrapper: setup() });

    act(() => result.current.onQueryChange('ba'));
    await waitFor(() => expect(result.current.options).toHaveLength(1));

    act(() => result.current.onQueryChange(null));
    expect(result.current.options).toEqual([]);
    act(() => result.current.onQueryChange('b'));
    expect(result.current.options).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(result.current.options).toEqual([]);
  });

  it('never offers the caller themselves, in a group list or a friend list, and still fills the list', async () => {
    useAuthStore.setState({
      user: {
        id: 'me',
        email: 'me@example.com',
        firstName: 'Jordan',
        lastName: 'Lee',
        username: 'jordan',
        phoneNumber: null,
        avatarUrl: null,
        roles: ['ROLE_USER'],
      },
      accessToken: 'token',
      isBootstrapping: false,
    });
    const group = renderHook(() => usePostMentionSource(5), { wrapper: setup() });
    serve([
      { userId: 'me', fullName: 'Jordan Lee', avatarUrl: null },
      { userId: 'a', fullName: 'Jo A', avatarUrl: null },
      { userId: 'b', fullName: 'Jo B', avatarUrl: null },
      { userId: 'c', fullName: 'Jo C', avatarUrl: null },
      { userId: 'd', fullName: 'Jo D', avatarUrl: null },
      { userId: 'e', fullName: 'Jo E', avatarUrl: null },
    ]);
    act(() => group.result.current.onQueryChange('jo'));
    await waitFor(() => expect(group.result.current.options).toHaveLength(5));
    expect(group.result.current.options.map((option) => option.id)).toEqual(['a', 'b', 'c', 'd', 'e']);

    const friends = renderHook(() => usePostMentionSource(null), { wrapper: setup() });
    act(() => friends.result.current.onQueryChange(''));
    await waitFor(() => expect(friends.result.current.options.length).toBeGreaterThan(0));
    expect(friends.result.current.options.map((option) => option.id)).not.toContain('me');
  });
});
