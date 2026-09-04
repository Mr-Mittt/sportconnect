import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import { useProfileActiveSport } from './useProfileActiveSport';

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
    sportName: 'Badminton',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useProfileActiveSport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useProfilePageStore.setState({ activeSport: null });
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
    useProfilePageStore.setState({ activeSport: null });
  });

  it('defaults to the first sport profile and persists it into the store', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: [profile({ sportId: 5 })], timestamp: '' },
    });

    const { result } = renderHook(() => useProfileActiveSport(), { wrapper });

    await waitFor(() => expect(result.current.activeSport).toBe('football'));
    expect(useProfilePageStore.getState().activeSport).toBe('football');
  });

  it('respects an already-stored active sport instead of overriding it', async () => {
    useProfilePageStore.setState({ activeSport: 'basketball' });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: [profile({ sportId: 5 })], timestamp: '' },
    });

    const { result } = renderHook(() => useProfileActiveSport(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeSport).toBe('basketball');
  });

  it('returns undefined for a caller with zero sport profiles', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: [], timestamp: '' },
    });

    const { result } = renderHook(() => useProfileActiveSport(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeSport).toBeUndefined();
    expect(useProfilePageStore.getState().activeSport).toBeNull();
  });
});
