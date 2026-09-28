import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useLocaleStore } from '@/app/localeStore';
import { useSyncUserLocale } from './useSyncUserLocale';

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

function preferencesResponse(language: string | null) {
  return {
    data: {
      success: true,
      message: '',
      data: {
        language,
        timezone: null,
        distanceUnit: null,
        notificationEmail: null,
        notificationPush: null,
        notificationSms: null,
        privacyProfile: null,
        privacyLocation: null,
        createdAt: null,
        updatedAt: null,
      },
      timestamp: '',
    },
  };
}

describe('useSyncUserLocale', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useLocaleStore.getState().setLocale('en');
  });

  afterEach(() => {
    useAuthStore.getState().clearSession();
    useLocaleStore.getState().setLocale('en');
  });

  it("pushes the signed-in user's stored language into localeStore once it resolves", async () => {
    useAuthStore.getState().setSession(testUser, 'access-token');
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(preferencesResponse('vi'));

    renderHook(() => useSyncUserLocale(), { wrapper });

    await waitFor(() => expect(useLocaleStore.getState().locale).toBe('vi'));
  });

  it('does nothing while logged out — the query stays disabled', () => {
    const spy = vi.spyOn(apiClient, 'get');

    renderHook(() => useSyncUserLocale(), { wrapper });

    expect(spy).not.toHaveBeenCalled();
    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('leaves locale untouched when the stored language is null (never set)', async () => {
    useAuthStore.getState().setSession(testUser, 'access-token');
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(preferencesResponse(null));

    renderHook(() => useSyncUserLocale(), { wrapper });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(useLocaleStore.getState().locale).toBe('en');
  });
});
