import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '@/features/session/queryKeys';
import {
  sportProfilesQueryKey,
  sportProfilesWithInactiveQueryKey,
} from '@/shared/hooks/useRawMySportProfiles';
import { useDeactivateSportProfile } from './useDeactivateSportProfile';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDeactivateSportProfile', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('DELETEs /sports/profiles/{id} and invalidates the three sport-profile-affecting keys', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      data: { success: true, message: '', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useDeactivateSportProfile(), {
      wrapper: wrapper(queryClient),
    });

    act(() => result.current.deactivateSportProfile(42));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/sports/profiles/42'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sportProfilesQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sportProfilesWithInactiveQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...sessionKeys.all, 'discover'] });
  });

  it('shows the localized not-found copy for a 404 (CLIENT-ERR-1), not the English server text', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(apiClient, 'delete').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 404, data: { success: false, message: 'Sport profile not found', data: null } },
    });

    const { result } = renderHook(() => useDeactivateSportProfile(), {
      wrapper: wrapper(queryClient),
    });

    act(() => result.current.deactivateSportProfile(999));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.errorMessage).toBe('This no longer exists or was removed.');
  });
});
