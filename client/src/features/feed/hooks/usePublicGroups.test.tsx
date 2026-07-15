import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { usePublicGroups } from './usePublicGroups';

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

describe('usePublicGroups', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls GET /groups/public with no params when sportId/keyword are absent', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => usePublicGroups(undefined, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/groups/public', { params: {} });
  });

  it('passes sportId and keyword as params when provided', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: emptyPage, timestamp: '' },
    });

    const { result } = renderHook(() => usePublicGroups(5, 'riverside'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/groups/public', {
      params: { sportId: 5, keyword: 'riverside' },
    });
  });

  it('does not fetch when enabled is false', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => usePublicGroups(undefined, '', false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });
});
