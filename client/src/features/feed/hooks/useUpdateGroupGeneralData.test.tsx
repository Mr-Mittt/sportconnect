import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import type { GroupInfo } from '../types';
import { useUpdateGroupGeneralData } from './useUpdateGroupGeneralData';

function info(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    groupId: 1,
    groupName: 'Riverside Ballers',
    isPrivate: false,
    description: null,
    avatarUrl: null,
    coverUrl: null,
    rules: null,
    schedule: null,
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useUpdateGroupGeneralData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls PUT /groups/{groupId}/generalData with the partial payload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = info({ rules: 'Be kind' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroupGeneralData(), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { rules: 'Be kind' } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.put).toHaveBeenCalledWith('/groups/1/generalData', { rules: 'Be kind' });
  });

  it('writes the response into the groupInfo cache entry', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const updated = info({ schedule: 'Sundays' });
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: { success: true, message: '', data: updated, timestamp: '' },
    });

    const { result } = renderHook(() => useUpdateGroupGeneralData(), { wrapper: wrapper(queryClient) });

    act(() => result.current.mutate({ groupId: 1, payload: { schedule: 'Sundays' } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(feedKeys.groupInfo(1))).toEqual(updated);
  });
});
