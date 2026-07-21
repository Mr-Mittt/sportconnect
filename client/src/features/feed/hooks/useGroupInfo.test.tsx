import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { GroupInfo } from '../types';
import { useGroupInfo } from './useGroupInfo';

function groupInfo(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    groupId: 1,
    groupName: 'Riverside Ballers',
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

describe('useGroupInfo', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls GET /groups/{groupId}/info when enabled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: groupInfo({ rules: 'Be nice' }), timestamp: '' },
    });

    const { result } = renderHook(() => useGroupInfo(1, true), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/groups/1/info');
    expect(result.current.data?.rules).toBe('Be nice');
  });

  it('does not fetch when disabled', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const getSpy = vi.spyOn(apiClient, 'get');

    renderHook(() => useGroupInfo(1, false), { wrapper: wrapper(queryClient) });

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when groupId is undefined', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const getSpy = vi.spyOn(apiClient, 'get');

    renderHook(() => useGroupInfo(undefined, true), { wrapper: wrapper(queryClient) });

    expect(getSpy).not.toHaveBeenCalled();
  });
});
