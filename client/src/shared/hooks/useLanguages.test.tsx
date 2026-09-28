import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { LanguageResponse } from '@/shared/types/reference';
import { useLanguages } from './useLanguages';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

const languages: LanguageResponse[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
];

describe('useLanguages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches from GET /reference/languages', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse(languages));

    const { result } = renderHook(() => useLanguages(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/reference/languages');
    expect(result.current.data).toEqual(languages);
    expect(result.current.isError).toBe(false);
  });

  it('defaults data to [] while loading/on error, never undefined', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useLanguages(), { wrapper });

    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
