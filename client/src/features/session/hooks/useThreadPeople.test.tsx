import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useThreadPeople } from './useThreadPeople';

// CLIENT-GL-50: the people search behind the `@` list of a session thread. The previous list lives only within one `@` word.

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function reply(...names: string[]) {
  return {
    data: { success: true, message: '', timestamp: '', data: names.map((fullName, i) => ({ userId: `u-${i}`, fullName, avatarUrl: null })) },
  };
}

describe('useThreadPeople', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('asks GET /sessions/{id}/thread-people with the typed word and nothing while idle', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(reply('Priya Shah'));
    const { result, rerender } = renderHook(({ q, s }) => useThreadPeople(9, q, s), {
      wrapper: setup(),
      initialProps: { q: null as string | null, s: 0 },
    });
    expect(get).not.toHaveBeenCalled();
    rerender({ q: 'pr', s: 0 });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(get).toHaveBeenCalledWith('/sessions/9/thread-people', { params: { q: 'pr', size: 6 } });
  });

  it('keeps the previous list inside one @ word, and starts empty after the search went idle', async () => {
    let release: (value: ReturnType<typeof reply>) => void = () => {};
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce(reply('Priya Shah'))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockRejectedValueOnce(new Error('boom'));
    const { result, rerender } = renderHook(({ q, s }) => useThreadPeople(9, q, s), {
      wrapper: setup(),
      initialProps: { q: 'p' as string | null, s: 0 },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    rerender({ q: 'pr', s: 0 });
    expect(result.current.data?.[0].fullName).toBe('Priya Shah');
    release(reply('Priya Shah', 'Prem'));
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    rerender({ q: null, s: 1 });
    rerender({ q: 'x', s: 1 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
