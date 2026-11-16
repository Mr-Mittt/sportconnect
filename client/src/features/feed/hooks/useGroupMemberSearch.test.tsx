import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useGroupMemberSearch } from './useGroupMemberSearch';

// CLIENT-GL-50 part 2 (B23): the group member search behind the `@` list of a group post and its comments.

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
}

function reply(...names: string[]) {
  return {
    data: {
      success: true,
      message: '',
      timestamp: '',
      data: names.map((fullName, index) => ({ userId: `u-${index}`, fullName, avatarUrl: null })),
    },
  };
}

describe('useGroupMemberSearch', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('asks GET /groups/{id}/members/search with the typed word and one more than the list shows, and nothing while idle', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(reply('Bao Le'));
    const wrapper = setup();
    const { result, rerender } = renderHook(({ q, s }) => useGroupMemberSearch(5, q, s), {
      wrapper,
      initialProps: { q: null as string | null, s: 0 },
    });
    expect(get).not.toHaveBeenCalled();

    rerender({ q: 'ba', s: 0 });
    await waitFor(() => expect(result.current.data).toEqual([{ userId: 'u-0', fullName: 'Bao Le', avatarUrl: null }]));
    expect(get).toHaveBeenCalledWith('/groups/5/members/search', { params: { q: 'ba', size: 6 } });
  });

  it('does not ask without a group', () => {
    const get = vi.spyOn(apiClient, 'get');
    renderHook(() => useGroupMemberSearch(undefined, 'ba'), { wrapper: setup() });
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps the previous list while the next request of the same @ word loads (no flicker)', async () => {
    let release: (value: ReturnType<typeof reply>) => void = () => {};
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce(reply('Bao Le'))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const { result, rerender } = renderHook(({ q, s }) => useGroupMemberSearch(5, q, s), {
      wrapper: setup(),
      initialProps: { q: 'b' as string | null, s: 0 },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    rerender({ q: 'ba', s: 0 });
    expect(result.current.data?.[0].fullName).toBe('Bao Le');
    expect(result.current.isPlaceholderData).toBe(true);
    release(reply('Bao Tran'));
    await waitFor(() => expect(result.current.data?.[0].fullName).toBe('Bao Tran'));
  });

  it('starts the next @ word empty after the search went idle, so a failed request shows no list, not the last one', async () => {
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce(reply('Bao Le'))
      .mockRejectedValueOnce(new Error('boom'));
    const { result, rerender } = renderHook(({ q, s }) => useGroupMemberSearch(5, q, s), {
      wrapper: setup(),
      initialProps: { q: 'ba' as string | null, s: 0 },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    // a pick, Esc, blur or the caret leaving the word: the box reports no @ word
    rerender({ q: null, s: 1 });
    rerender({ q: 'b', s: 1 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('a failed request in the middle of one @ word is an empty list as well', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(reply('Bao Le')).mockRejectedValueOnce(new Error('boom'));
    const { result, rerender } = renderHook(({ q, s }) => useGroupMemberSearch(5, q, s), {
      wrapper: setup(),
      initialProps: { q: 'b' as string | null, s: 0 },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    rerender({ q: 'ba', s: 0 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
