import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import { useJoinGroup } from './useJoinGroup';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useJoinGroup', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /groups/join-requests with groupName (no groupId field)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: {
          id: 1,
          groupId: 5,
          groupName: 'Riverside Ballers',
          userId: 'user-1',
          userFullName: 'Jordan Lee',
          userAvatarUrl: null,
          status: 'pending',
          message: null,
          reviewedBy: null,
          reviewedByFullName: null,
          reviewedAt: null,
          createdAt: '2026-07-15T00:00:00',
          updatedAt: '2026-07-15T00:00:00',
        },
        timestamp: '',
      },
    });

    const { result } = renderHook(() => useJoinGroup(), { wrapper });

    act(() => result.current.mutate({ groupName: 'Riverside Ballers' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/groups/join-requests', {
      groupName: 'Riverside Ballers',
    });
    expect(result.current.data?.status).toBe('pending');
  });

  it('invalidates feed queries on settle', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        message: '',
        data: {
          id: 1,
          groupId: 5,
          groupName: 'Riverside Ballers',
          userId: 'user-1',
          userFullName: 'Jordan Lee',
          userAvatarUrl: null,
          status: 'pending',
          message: null,
          reviewedBy: null,
          reviewedByFullName: null,
          reviewedAt: null,
          createdAt: '2026-07-15T00:00:00',
          updatedAt: '2026-07-15T00:00:00',
        },
        timestamp: '',
      },
    });

    const { result } = renderHook(() => useJoinGroup(), { wrapper: localWrapper });

    act(() => result.current.mutate({ groupName: 'Riverside Ballers' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });
});
