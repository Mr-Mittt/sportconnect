import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { sportProfilesQueryKey } from '@/shared/hooks/useSportProfilesForUser';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useUpdateSportProfile } from './useUpdateSportProfile';

const testUser = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function profile(overrides: Partial<UserSportProfileResponse> = {}): UserSportProfileResponse {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Football',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useUpdateSportProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('calls PUT /sports/profiles/{profileId} with the payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = profile({ skillLevel: 'advanced' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateSportProfile(), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.updateSportProfile({
        profileId: 1,
        payload: { sportId: 5, skillLevel: 'advanced' },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/sports/profiles/1', {
      sportId: 5,
      skillLevel: 'advanced',
    });
  });

  it('patches the matching entry in the sportProfiles cache in place', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(sportProfilesQueryKey('user-1'), [
      profile({ id: 1, skillLevel: 'beginner' }),
      profile({ id: 2, sportId: 6 }),
    ]);
    const updated = profile({ id: 1, skillLevel: 'advanced' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateSportProfile(), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.updateSportProfile({
        profileId: 1,
        payload: { sportId: 5, skillLevel: 'advanced' },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<UserSportProfileResponse[]>(
      sportProfilesQueryKey('user-1'),
    );
    expect(cached?.find((p) => p.id === 1)?.skillLevel).toBe('advanced');
    expect(cached).toHaveLength(2);
  });

  it('surfaces the server\'s own error message', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { success: false, message: 'heightCm must be between 50 and 300', data: null, timestamp: '' },
      },
    });

    const { result } = renderHook(() => useUpdateSportProfile(), { wrapper: wrapper(queryClient) });

    act(() =>
      result.current.updateSportProfile({ profileId: 1, payload: { sportId: 5, skillLevel: 'advanced' } }),
    );

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('heightCm must be between 50 and 300'),
    );
  });
});
