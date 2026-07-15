import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { PageResponse, Post } from '../types';
import { usePostsByHashtag } from './usePostsByHashtag';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function emptyPage(): PageResponse<Post> {
  return {
    content: [],
    totalPages: 1,
    totalElements: 0,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 0,
    empty: true,
  };
}

describe('usePostsByHashtag', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('strips the leading # before calling GET /posts/hashtag/{tag} — the real backend matches un-prefixed tags', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage(), timestamp: '' },
    });

    const { result } = renderHook(() => usePostsByHashtag('#fridayrun'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/hashtag/fridayrun', {
      params: { page: 0, size: 20 },
    });
  });

  it('accepts a tag with no leading # unchanged', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage(), timestamp: '' },
    });

    const { result } = renderHook(() => usePostsByHashtag('fridayrun'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/posts/hashtag/fridayrun', {
      params: { page: 0, size: 20 },
    });
  });

  it('does not fetch while enabled is false (FEED-6: modal not open yet)', () => {
    const spy = vi.spyOn(apiClient, 'get');

    renderHook(() => usePostsByHashtag('fridayrun', false), { wrapper });

    expect(spy).not.toHaveBeenCalled();
  });
});
