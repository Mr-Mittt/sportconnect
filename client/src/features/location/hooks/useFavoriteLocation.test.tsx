import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { showErrorToast } from '@/shared/lib/errorToast';
import { locationKeys } from '../queryKeys';
import { useFavoriteLocation } from './useFavoriteLocation';
import { useUnfavoriteLocation } from './useUnfavoriteLocation';

vi.mock('@/shared/lib/errorToast', () => ({ showErrorToast: vi.fn() }));

function coded(status: number, errorCode: string): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'x', errorCode, data: null } } as AxiosResponse;
  return error;
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

describe('favorite / unfavorite failures (CLIENT-ERR-8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(showErrorToast).mockClear();
  });

  it('a stale 409 on favorite refetches the favorites and shows nothing', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(coded(409, 'LOCATION_ALREADY_FAVORITED'));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useFavoriteLocation(), { wrapper });

    act(() => result.current.mutate({ locationId: 7, sportId: 3 }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showErrorToast).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: locationKeys.favorites(3) });
  });

  it('a stale 409 on unfavorite refetches the favorites and shows nothing', async () => {
    vi.spyOn(apiClient, 'delete').mockRejectedValueOnce(coded(409, 'LOCATION_NOT_FAVORITED'));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUnfavoriteLocation(), { wrapper });

    act(() => result.current.mutate({ locationId: 7, sportId: 3 }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showErrorToast).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: locationKeys.favorites(3) });
  });

  it('LOCATION_NOT_FOUND on favorite toasts once and refetches the favorites', async () => {
    const error = coded(404, 'LOCATION_NOT_FOUND');
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(error);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useFavoriteLocation(), { wrapper });

    act(() => result.current.mutate({ locationId: 7, sportId: 3 }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(showErrorToast).toHaveBeenCalledTimes(1);
    expect(showErrorToast).toHaveBeenCalledWith(error);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: locationKeys.favorites(3) });
  });
});
