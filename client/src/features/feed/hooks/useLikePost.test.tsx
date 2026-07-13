import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '../queryKeys';
import { useLikePost } from './useLikePost';

describe('useLikePost', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls POST /posts/{postId}/like and invalidates feed queries on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { success: true, message: 'Post liked successfully', data: null, timestamp: '' },
    });

    const { result } = renderHook(() => useLikePost(), { wrapper });

    act(() => {
      result.current.mutate(7);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/posts/7/like');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedKeys.all });
  });
});
