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

  it('returns the convention shape, resolved from GET /sports/profiles (caller-scoped, A22)', async () => {
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
    expect(apiClient.get).toHaveBeenCalledWith('/sports/profiles');
    expect(result.current.isError).toBe(false);
    // SPORT-3: football/basketball/tennis have no bespoke SPORT_PROFILE_CONFIG entry anymore
    // (the real MVP catalog only has Badminton/Pickleball, A6) — getSportProfileConfig's generic
    // fallback applies to all three (title-cased label, neutral ramp). This test's fixture ids
    // stay 5/6/2 regardless — it's exercising id->key resolution, not real production colors.
    // SPORT-4: iconUrl isn't part of that static fallback at all — it's resolved independently
    // from the live catalog (test/setup.ts's global seed) by sportId, so it's populated here even
    // though the label/colorRamp fall through to the generic config.
    expect(result.current.data).toEqual([
      { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'gray' },
      { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'gray' },
      { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'gray' },
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
