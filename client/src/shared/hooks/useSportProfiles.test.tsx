import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { User } from '@/features/auth/types';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useSportProfiles } from './useSportProfiles';

const mockUser: User = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function makeProfile(overrides: Partial<UserSportProfileResponse>): UserSportProfileResponse {
  return {
    id: 1,
    userId: mockUser.id,
    sportId: 5, // Soccer -> 'football'
    sportName: 'Soccer',
    skillLevel: null,
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-07-01T00:00:00',
    updatedAt: '2026-07-01T00:00:00',
    ...overrides,
  };
}

describe('useSportProfiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('does not fetch while the user is not signed in', () => {
    const spy = vi.spyOn(apiClient, 'get');
    renderHook(() => useSportProfiles(), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns the convention shape, resolved from GET /sports/profiles/user/{userId}', async () => {
    useAuthStore.setState({ user: mockUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse([
        makeProfile({ id: 1, sportId: 5, sportName: 'Soccer' }),
        makeProfile({ id: 2, sportId: 6, sportName: 'Basketball' }),
        makeProfile({ id: 3, sportId: 2, sportName: 'Tennis' }),
      ]),
    );

    const { result } = renderHook(() => useSportProfiles(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith(`/sports/profiles/user/${mockUser.id}`);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([
      { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
      { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
      { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
    ]);
  });

  it('drops profiles outside the known SportKey map and inactive profiles, without erroring', async () => {
    useAuthStore.setState({ user: mockUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse([
        makeProfile({ id: 1, sportId: 1, sportName: 'Badminton' }), // no SportKey mapping
        makeProfile({ id: 2, sportId: 6, sportName: 'Basketball', isActive: false }),
      ]),
    );

    const { result } = renderHook(() => useSportProfiles(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('returns an empty array (not undefined) for a user with zero sport profiles', async () => {
    useAuthStore.setState({ user: mockUser, accessToken: 'token', isBootstrapping: false });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse([]));

    const { result } = renderHook(() => useSportProfiles(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
