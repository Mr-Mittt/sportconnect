import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useMyProfile } from './useMyProfile';
import type { UserResponse } from './types';

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

const fixtureProfile: UserResponse = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  dateOfBirth: null,
  gender: null,
  bio: 'Weekend baller.',
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: 'Hanoi',
  country: 'Vietnam',
  heightCm: null,
  weightKg: null,
  shoeSizeCm: null,
  isEmailVerified: true,
  isActive: true,
  roles: ['USER'],
  createdAt: '2026-01-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Jordan Lee',
};

describe('useMyProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('fetches the logged-in user\'s full profile by their own id', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: fixtureProfile, timestamp: '' },
    });

    const { result } = renderHook(() => useMyProfile(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/users/user-1');
    expect(result.current.data?.city).toBe('Hanoi');
    expect(result.current.data?.country).toBe('Vietnam');
  });

  it('does not fetch while no user id is known yet', () => {
    useAuthStore.getState().clearSession();
    const spy = vi.spyOn(apiClient, 'get');

    renderHook(() => useMyProfile(), { wrapper });

    expect(spy).not.toHaveBeenCalled();
  });
});
