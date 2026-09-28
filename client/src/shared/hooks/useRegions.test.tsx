import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { RegionResponse } from '@/shared/types/reference';
import { useRegions } from './useRegions';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const regions: RegionResponse[] = [
  { id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' },
];

describe('useRegions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch while countryId is null', () => {
    const spy = vi.spyOn(apiClient, 'get');
    const { result } = renderHook(() => useRegions(null), { wrapper });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it('fetches from GET /reference/countries/{countryId}/regions', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(regions));

    const { result } = renderHook(() => useRegions(1), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/reference/countries/1/regions');
    expect(result.current.data).toEqual(regions);
    expect(result.current.isError).toBe(false);
  });

  it('returns [] (not an error) for a country with no seeded regions', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse([]));

    const { result } = renderHook(() => useRegions(2), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a fetch failure as isError', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Request failed with status code 404'));

    const { result } = renderHook(() => useRegions(999), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
