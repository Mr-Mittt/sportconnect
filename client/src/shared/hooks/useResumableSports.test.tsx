import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useResumableSports } from './useResumableSports';

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
    userId: 'user-1',
    sportId: 5,
    sportName: 'Football',
    skillLevel: 'intermediate',
    yearsOfExperience: 3,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

describe('useResumableSports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  it('requests GET /sports/profiles with includeInactive=true', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(apiResponse([]));
    const { result } = renderHook(() => useResumableSports(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith('/sports/profiles', {
      params: { includeInactive: true },
    });
  });

  it('derives the resumable set (inactive row, no active row) + previous skill/YoE + inactiveSports', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse([
        makeProfile({ id: 1, sportId: 5, isActive: true }), // football — active, not resumable
        makeProfile({
          id: 2,
          sportId: 6, // basketball — soft-deleted, no active row → resumable
          isActive: false,
          skillLevel: 'advanced',
          yearsOfExperience: 6,
        }),
      ]),
    );
    const { result } = renderHook(() => useResumableSports(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect([...result.current.resumableProfiles.keys()]).toEqual(['basketball']);
    expect(result.current.resumableProfiles.get('basketball')).toEqual({
      skillLevel: 'advanced',
      yearsOfExperience: 6,
    });
    expect(result.current.inactiveSports.map((s) => s.key)).toEqual(['basketball']);
  });

  it('excludes a sport that also has an active row (re-added since)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse([
        makeProfile({ id: 1, sportId: 6, isActive: false }),
        makeProfile({ id: 2, sportId: 6, isActive: true }),
      ]),
    );
    const { result } = renderHook(() => useResumableSports(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.resumableProfiles.size).toBe(0);
    expect(result.current.inactiveSports).toEqual([]);
  });

  it('drops an inactive row whose sportId the live catalog does not resolve', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(
      apiResponse([makeProfile({ id: 1, sportId: 999, isActive: false })]),
    );
    const { result } = renderHook(() => useResumableSports(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.resumableProfiles.size).toBe(0);
    expect(result.current.inactiveSports).toEqual([]);
  });
});
