import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupSettings } from '../types';
import { useGroupSettings } from './useGroupSettings';

function settings(overrides: Partial<GroupSettings>): GroupSettings {
  return {
    id: 1,
    groupId: 1,
    allowMemberPosts: true,
    requirePostApproval: false,
    allowMemberInvites: false,
    groupTypeName: 'DEFAULT',
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

describe('useGroupSettings', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls GET /groups/{groupId}/settings when enabled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: settings({}), timestamp: '' },
    });

    const { result } = renderHook(() => useGroupSettings(1, true), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/groups/1/settings');
    expect(result.current.data?.groupTypeName).toBe('DEFAULT');
  });

  it('does not fetch when disabled', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const getSpy = vi.spyOn(apiClient, 'get');

    renderHook(() => useGroupSettings(1, false), { wrapper: wrapper(queryClient) });

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when groupId is undefined', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const getSpy = vi.spyOn(apiClient, 'get');

    renderHook(() => useGroupSettings(undefined, true), { wrapper: wrapper(queryClient) });

    expect(getSpy).not.toHaveBeenCalled();
  });
});
