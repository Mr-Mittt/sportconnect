import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import type { UserInfo } from './types';
import { useUserInfo } from './useUserInfo';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const fixture: UserInfo = {
  id: 'u1',
  fullName: 'Owen Clarke',
  username: 'owenclarke',
  avatarUrl: null,
  coverUrl: null,
  bio: 'Plays most weekends.',
  activeSportIds: [1, 3],
};

describe('useUserInfo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a single user by id and unwraps the ApiResponse envelope', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { success: true, message: '', data: fixture, timestamp: '' },
    });

    const { result } = renderHook(() => useUserInfo('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/users/u1');
    expect(result.current.data).toEqual(fixture);
  });

  it('does not fetch while the user id is undefined', () => {
    const spy = vi.spyOn(apiClient, 'get');

    renderHook(() => useUserInfo(undefined), { wrapper });

    expect(spy).not.toHaveBeenCalled();
  });
});
