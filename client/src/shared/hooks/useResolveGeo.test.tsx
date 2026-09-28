import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { ResolvedGeoResponse } from '@/shared/types/reference';
import { useResolveGeo } from './useResolveGeo';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const allNull: ResolvedGeoResponse = { language: null, country: null, region: null, source: null };

describe('useResolveGeo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no data and not loading', () => {
    const { result } = renderHook(() => useResolveGeo(), { wrapper });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('posts to /reference/resolve and returns the resolved data', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(apiResponse(allNull));
    const { result } = renderHook(() => useResolveGeo(), { wrapper });

    await act(async () => {
      await result.current.resolve({ locales: ['en-US'], timeZoneId: 'Asia/Ho_Chi_Minh' });
    });

    expect(apiClient.post).toHaveBeenCalledWith('/reference/resolve', {
      locales: ['en-US'],
      timeZoneId: 'Asia/Ho_Chi_Minh',
    });
    await waitFor(() => expect(result.current.data).toEqual(allNull));
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a request failure (e.g. 400 on a malformed request) as isError', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Request failed with status code 400'));
    const { result } = renderHook(() => useResolveGeo(), { wrapper });

    await act(async () => {
      await result.current.resolve({}).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
