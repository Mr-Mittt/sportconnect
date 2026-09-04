import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useSportProfileSettingsTabData } from './useSportProfileSettingsTabData';

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

function profile(overrides: Partial<UserSportProfileResponse>): UserSportProfileResponse {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 5,
    sportName: 'Football',
    skillLevel: 'beginner',
    yearsOfExperience: 2,
    bio: null,
    attributes: { dominantFoot: 'right' },
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function mockGet(profiles: UserSportProfileResponse[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/profiles') {
      return { data: { success: true, message: '', data: profiles, timestamp: '' } };
    }
    if (/\/sports\/\d+\/attribute-schema$/.test(url)) {
      return { data: { success: true, message: '', data: null, timestamp: '' } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useSportProfileSettingsTabData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useProfilePageStore.setState({ activeSport: null });
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
    useProfilePageStore.setState({ activeSport: null });
  });

  it('seeds the draft from the active (first) sport profile', async () => {
    mockGet([profile({ sportId: 5 })]);

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });

    await waitFor(() => expect(result.current.activeProfile).not.toBeUndefined());
    expect(result.current.draft).toEqual({
      skillLevel: 'beginner',
      yearsOfExperience: '2',
      attributes: { dominantFoot: 'right' },
    });
  });

  it('re-seeds and discards unsaved edits when the active sport switches', async () => {
    mockGet([
      profile({ id: 1, sportId: 5, skillLevel: 'beginner', yearsOfExperience: 2 }),
      profile({ id: 2, sportId: 6, skillLevel: 'advanced', yearsOfExperience: 8 }),
    ]);

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });
    await waitFor(() => expect(result.current.activeProfile?.sportId).toBe(5));

    act(() => result.current.setYearsOfExperience('9'));
    expect(result.current.draft.yearsOfExperience).toBe('9');
    expect(result.current.isDirty).toBe(true);

    act(() => useProfilePageStore.getState().setActiveSport('basketball'));

    await waitFor(() => expect(result.current.activeProfile?.sportId).toBe(6));
    expect(result.current.draft.yearsOfExperience).toBe('8');
    expect(result.current.isDirty).toBe(false);
  });

  it('is undefined for a caller with zero sport profiles', async () => {
    mockGet([]);

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfile).toBeUndefined();
  });

  it('save calls the update mutation with the diffed payload', async () => {
    mockGet([profile({ sportId: 5 })]);
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: profile({ sportId: 5, yearsOfExperience: 9 }),
        timestamp: '',
      },
    });

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });
    await waitFor(() => expect(result.current.activeProfile).not.toBeUndefined());

    act(() => result.current.setYearsOfExperience('9'));
    act(() => result.current.save());

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith('/sports/profiles/1', {
        sportId: 5,
        skillLevel: 'beginner',
        yearsOfExperience: 9,
      }),
    );
  });

  it('save runs the onSuccess callback once the mutation resolves (PROFILE-10 unsaved-changes guard)', async () => {
    mockGet([profile({ sportId: 5 })]);
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: profile({ sportId: 5, yearsOfExperience: 9 }),
        timestamp: '',
      },
    });

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });
    await waitFor(() => expect(result.current.activeProfile).not.toBeUndefined());
    act(() => result.current.setYearsOfExperience('9'));

    const onSuccess = vi.fn();
    act(() => result.current.save({ onSuccess }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('discard resets the draft to the saved profile without changing activeProfile', async () => {
    mockGet([profile({ sportId: 5, yearsOfExperience: 7 })]);

    const { result } = renderHook(() => useSportProfileSettingsTabData(), { wrapper });
    await waitFor(() => expect(result.current.activeProfile).not.toBeUndefined());

    act(() => result.current.setYearsOfExperience('9'));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.discard());

    expect(result.current.draft.yearsOfExperience).toBe('7');
    expect(result.current.isDirty).toBe(false);
  });

  it('SPORT-10: sportKeyOverride resolves a deactivated (isActive:false) row', async () => {
    // sportId 6 → 'basketball' in the global test catalog; only an inactive row for it.
    mockGet([
      profile({ id: 5, sportId: 5, isActive: true }),
      profile({ id: 6, sportId: 6, isActive: false, skillLevel: 'advanced' }),
    ]);

    const { result } = renderHook(() => useSportProfileSettingsTabData('basketball'), { wrapper });

    await waitFor(() => expect(result.current.activeProfile).not.toBeUndefined());
    expect(result.current.activeProfile?.id).toBe(6);
    expect(result.current.activeProfile?.isActive).toBe(false);
  });
});
