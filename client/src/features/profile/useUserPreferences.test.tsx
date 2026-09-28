import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useUserPreferences } from './useUserPreferences';
import type { UserPreferenceResponse } from './types';

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

const fixturePreferences: UserPreferenceResponse = {
  language: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  distanceUnit: 'km',
  notificationEmail: true,
  notificationPush: true,
  notificationSms: false,
  privacyProfile: 'PUBLIC',
  privacyLocation: 'FRIENDS',
  createdAt: '2026-01-01T00:00:00',
  updatedAt: '2026-01-01T00:00:00',
};

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('fetches the logged-in user\'s preferences', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: fixturePreferences, timestamp: '' },
    });

    const { result } = renderHook(() => useUserPreferences(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/users/me/preferences');
    expect(result.current.data?.language).toBe('vi');
  });

  it('does not fetch while no user id is known yet (logged out)', () => {
    useAuthStore.getState().clearSession();
    const spy = vi.spyOn(apiClient, 'get');

    renderHook(() => useUserPreferences(), { wrapper });

    expect(spy).not.toHaveBeenCalled();
  });
});
