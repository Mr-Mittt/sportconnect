import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useCreateLocation } from './useCreateLocation';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const created = {
  id: 1,
  sportId: 1,
  sportName: 'Football',
  name: 'Riverside Sports Complex',
  address: null,
  latitude: 21.0285,
  longitude: 105.8542,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-07-30T00:00:00',
  updatedAt: '2026-07-30T00:00:00',
};

describe('useCreateLocation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the payload to POST /locations and returns the created location', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useCreateLocation(), { wrapper });
    result.current.mutate({ sportId: 1, name: 'Riverside Sports Complex' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/locations', { sportId: 1, name: 'Riverside Sports Complex' });
    expect(result.current.data).toEqual(created);
  });
});
