import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '@/features/session/queryKeys';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import {
  sportProfilesQueryKey,
  sportProfilesWithInactiveQueryKey,
} from './useRawMySportProfiles';
import { useAddSportProfile } from './useAddSportProfile';

function profile(overrides: Partial<UserSportProfileResponse>): UserSportProfileResponse {
  return {
    id: 1,
    userId: 'user-1',
    sportId: 6,
    sportName: 'Basketball',
    skillLevel: 'beginner',
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAddSportProfile', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /sports/profiles with the payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const created = profile({ id: 9 });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 6, skillLevel: 'beginner' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/sports/profiles', {
      sportId: 6,
      skillLevel: 'beginner',
    });
  });

  it('appends the new profile into the sportProfiles cache immediately', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(sportProfilesQueryKey, [profile({ id: 1, sportId: 5 })]);
    const created = profile({ id: 9, sportId: 6 });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: created, timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 6, skillLevel: 'beginner' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<UserSportProfileResponse[]>(
      sportProfilesQueryKey,
    );
    expect(cached).toHaveLength(2);
    expect(cached?.[1]).toEqual(created);
  });

  it('invalidates the sportProfiles query on settle', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: profile({ id: 9 }), timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 6, skillLevel: 'beginner' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sportProfilesQueryKey });
  });

  it('invalidates discover-session queries too, since GET /sessions/discover is gated to the caller\'s sport profiles', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    // Simulates SessionDiscoverModal opening while the caller had zero profiles — cached empty.
    queryClient.setQueryData(sessionKeys.discover(undefined), { content: [] });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: profile({ id: 9 }), timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 6, skillLevel: 'beginner' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...sessionKeys.all, 'discover'] });
    expect(queryClient.getQueryState(sessionKeys.discover(undefined))?.isInvalidated).toBe(true);
  });

  it('does not touch the cache when userId is undefined', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: profile({ id: 9 }), timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile(undefined), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 6, skillLevel: 'beginner' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(setQueryDataSpy).not.toHaveBeenCalled();
  });

  // ─── SPORT-10 ─────────────────────────────────────────────────────────────

  it('passes an isResume payload straight through to POST /sports/profiles', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: profile({ id: 9, sportId: 3 }), timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 3, isResume: true }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/sports/profiles', { sportId: 3, isResume: true });
  });

  it('on settle, invalidates both the active-only and the includeInactive sport-profile keys', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: '', data: profile({ id: 9 }), timestamp: '' },
    });

    const { result } = renderHook(() => useAddSportProfile('user-1'), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ sportId: 3, isResume: true }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sportProfilesQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sportProfilesWithInactiveQueryKey });
  });
});
