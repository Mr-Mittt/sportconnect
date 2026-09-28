import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { CountryResponse } from '@/shared/types/reference';
import { useCountries } from './useCountries';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const countries: CountryResponse[] = [
  { id: 1, iso2: 'VN', iso3: 'VNM', name: 'Vietnam', defaultLanguageCode: 'vi' },
];

describe('useCountries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches from GET /reference/countries', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(countries));

    const { result } = renderHook(() => useCountries(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/reference/countries');
    expect(result.current.data).toEqual(countries);
    expect(result.current.isError).toBe(false);
  });

  it('defaults data to [] while loading/on error, never undefined', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useCountries(), { wrapper });

    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
