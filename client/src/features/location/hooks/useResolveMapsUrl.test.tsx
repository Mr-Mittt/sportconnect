import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useResolveMapsUrl } from './useResolveMapsUrl';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useResolveMapsUrl', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the pasted URL and returns the resolved coordinates', async () => {
    const resolved = { latitude: 21.0285, longitude: 105.8542, suggestedName: 'Riverside Sports Complex' };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: resolved, timestamp: '' },
    });

    const { result } = renderHook(() => useResolveMapsUrl(), { wrapper });
    result.current.mutate('https://maps.app.goo.gl/abc123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/locations/resolve-maps-url', {
      url: 'https://maps.app.goo.gl/abc123',
    });
    expect(result.current.data).toEqual(resolved);
  });

  it('resolves with null coordinates without treating it as a mutation error', async () => {
    const resolved = { latitude: null, longitude: null, suggestedName: null };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: resolved, timestamp: '' },
    });

    const { result } = renderHook(() => useResolveMapsUrl(), { wrapper });
    result.current.mutate('https://maps.app.goo.gl/unresolvable');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(resolved);
  });
});
