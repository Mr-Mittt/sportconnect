import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupSettings } from '../types';
import { useUpdateGroupSettings } from './useUpdateGroupSettings';

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

describe('useUpdateGroupSettings', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls PUT /groups/{groupId}/settings with the partial payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = settings({ allowMemberInvites: true });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroupSettings(), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { allowMemberInvites: true } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/groups/1/settings', { allowMemberInvites: true });
  });

  it('writes the response into the groupSettings cache entry', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = settings({ requirePostApproval: true });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroupSettings(), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { requirePostApproval: true } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(feedKeys.groupSettings(1))).toEqual(updated);
  });
});
