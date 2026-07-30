import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useLocationSearch } from './useLocationSearch';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const emptyPage = {
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

describe('useLocationSearch', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls GET /locations/search with sportId only when the keyword is empty', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useLocationSearch(1, '', true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/locations/search', { params: { sportId: 1 } });
  });

  it('passes q when a keyword is submitted', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => useLocationSearch(1, 'riverside', true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/locations/search', {
      params: { sportId: 1, q: 'riverside' },
    });
  });

  it('does not fetch when enabled is false', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useLocationSearch(1, '', false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });
});
