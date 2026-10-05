import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { profileKeys } from './queryKeys';
import { useUpdateMyProfile } from './useUpdateMyProfile';
import type { UserResponse } from './types';

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

function profile(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
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
    countryId: 1,
    regionId: 101,
    regionName: 'Hanoi',
    heightCm: null,
    weightKg: null,
    shoeSizeMm: null,
    isEmailVerified: true,
    isActive: true,
    roles: ['USER'],
    createdAt: '2026-01-01T00:00:00',
    lastLoginAt: null,
    fullName: 'Jordan Lee',
    ...overrides,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useUpdateMyProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('calls PUT /users/{userId}/profile with the diffed payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = profile({ bio: 'New bio' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper: wrapper(queryClient) });

    act(() => result.current.updateProfile({ bio: 'New bio' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/users/user-1/profile', { bio: 'New bio' });
  });

  it('patches the myProfile cache with the returned row on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(profileKeys.myProfile('user-1'), profile());
    const updated = profile({ bio: 'New bio' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper: wrapper(queryClient) });

    act(() => result.current.updateProfile({ bio: 'New bio' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<UserResponse>(profileKeys.myProfile('user-1'))?.bio).toBe(
      'New bio',
    );
  });

  it('surfaces the server\'s own error message', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(apiClient, 'put').mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          message: 'Username must be between 3 and 50 characters',
          data: null,
          timestamp: '',
        },
      },
    });

    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper: wrapper(queryClient) });

    act(() => result.current.updateProfile({ username: 'ab' }));

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Username must be between 3 and 50 characters'),
    );
  });

  it('updateProfileAsync resolves with the updated row (CLIENT-REF-3: useEditProfileSave awaits this)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = profile({ countryId: 2 });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateMyProfile(), { wrapper: wrapper(queryClient) });

    await expect(result.current.updateProfileAsync({ countryId: 2 })).resolves.toEqual(updated);
  });
});
