import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useMySportProfilesRaw } from './useMySportProfilesRaw';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

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

const fixtureProfile: UserSportProfileResponse = {
  id: 42,
  userId: 'user-1',
  sportId: 1,
  sportName: 'Badminton',
  skillLevel: 'INTERMEDIATE',
  yearsOfExperience: 3,
  preferredPosition: null,
  bio: null,
  attributes: { racket: { id: null, value: 'Yonex Astrox' } },
  isActive: true,
  createdAt: '2026-01-01T00:00:00',
  updatedAt: '2026-01-01T00:00:00',
};

describe('useMySportProfilesRaw', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('fetches the raw sport-profile shape (id/attributes/skillLevel intact)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: [fixtureProfile], timestamp: '' },
    });

    const { result } = renderHook(() => useMySportProfilesRaw(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/sports/profiles/user/user-1');
    expect(result.current.data).toEqual([fixtureProfile]);
  });

  it('returns an empty array, not undefined, before data loads', () => {
    useAuthStore.getState().clearSession();

    const { result } = renderHook(() => useMySportProfilesRaw(), { wrapper });

    expect(result.current.data).toEqual([]);
  });
});
