import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useCompleteProfileStore } from '@/app/completeProfileStore';
import type { UserResponse } from './types';
import { useCompleteProfilePrompt } from './useCompleteProfilePrompt';

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function profile(overrides: Partial<UserResponse> = {}): UserResponse {
  return { id: 'user-1', countryId: null, regionId: null, ...overrides } as UserResponse;
}

let regionsByCountry: Record<number, unknown[]>;

beforeEach(() => {
  useCompleteProfileStore.setState({ skippedFor: null });
  regionsByCountry = { 1: [{ id: 101, countryId: 1, isoCode: 'VN-HN', name: 'Hanoi', nativeName: 'Hà Nội' }], 2: [] };
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const match = /\/reference\/countries\/(\d+)\/regions/.exec(url as string);
    if (match) return apiResponse(regionsByCountry[Number(match[1])] ?? []);
    throw new Error(`unexpected GET ${String(url)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCompleteProfilePrompt', () => {
  it('stays closed while the profile is still loading', () => {
    const { result } = renderHook(() => useCompleteProfilePrompt(undefined), { wrapper });
    expect(result.current.isOpen).toBe(false);
  });

  it('opens for a profile with no country', () => {
    const { result } = renderHook(() => useCompleteProfilePrompt(profile()), { wrapper });
    expect(result.current.isOpen).toBe(true);
  });

  it('opens for a country that has regions when no region is set, once the regions have loaded', async () => {
    const { result } = renderHook(() => useCompleteProfilePrompt(profile({ countryId: 1 })), { wrapper });
    expect(result.current.isOpen).toBe(false);
    await waitFor(() => expect(result.current.isOpen).toBe(true));
  });

  it('stays closed for a country that has no regions', async () => {
    const { result } = renderHook(() => useCompleteProfilePrompt(profile({ countryId: 2 })), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(result.current.isOpen).toBe(false);
  });

  it('stays closed for a complete profile', async () => {
    const { result } = renderHook(() => useCompleteProfilePrompt(profile({ countryId: 1, regionId: 101 })), {
      wrapper,
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(result.current.isOpen).toBe(false);
  });

  it('stays closed when the region list failed (the dialog could not offer a region anyway)', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCompleteProfilePrompt(profile({ countryId: 1 })), { wrapper });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(result.current.isOpen).toBe(false);
  });

  it('skip closes it for that user in this session, and only for that user', () => {
    const { result, rerender } = renderHook(({ user }) => useCompleteProfilePrompt(user), {
      wrapper,
      initialProps: { user: profile() },
    });
    expect(result.current.isOpen).toBe(true);

    result.current.skip();
    rerender({ user: profile() });
    expect(result.current.isOpen).toBe(false);

    rerender({ user: profile({ id: 'user-2' }) });
    expect(result.current.isOpen).toBe(true);
  });
});
