import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useSessionErrorDialogStore } from '@/app/sessionErrorDialogStore';
import * as errorToast from '@/shared/lib/errorToast';
import { SHARE_LIMIT, useShareSession } from './useShareSession';

// CLIENT-SESSION-49: POST /sessions/{id}/shares.

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function failure(status: number, errorCode?: string) {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { success: false, message: 'prose', errorCode } } as AxiosResponse;
  return error;
}

describe('useShareSession', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    useSessionErrorDialogStore.setState({ error: null, dismissals: 0, lastDismissedForbidden: false });
  });

  afterEach(() => vi.restoreAllMocks());

  it('limits one share to the 50 friends the server accepts', () => {
    expect(SHARE_LIMIT).toBe(50);
  });

  it('posts the chosen ids to the session\'s shares endpoint and returns { sent, skipped }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '', timestamp: '', data: { sent: 2, skipped: 1 } },
    });
    const { result } = renderHook(() => useShareSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate({ sessionId: 7, userIds: ['u-1', 'u-2', 'u-3'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith('/sessions/7/shares', { userIds: ['u-1', 'u-2', 'u-3'] });
    expect(result.current.data).toEqual({ sent: 2, skipped: 1 });
  });

  it('refetches no session query: a share changes nothing in the session', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '', timestamp: '', data: { sent: 1, skipped: 0 } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useShareSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate({ sessionId: 7, userIds: ['u-1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'SESSION_NOT_FOUND'],
    [403, 'SESSION_SHARE_NOT_ALLOWED'],
  ])('opens the session error dialog for %s %s, and shows no toast', async (status, code) => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    const error = failure(status, code);
    vi.spyOn(apiClient, 'post').mockRejectedValue(error);
    const { result } = renderHook(() => useShareSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate({ sessionId: 7, userIds: ['u-1'] });

    await waitFor(() => expect(useSessionErrorDialogStore.getState().error).toBe(error));
    expect(toast).not.toHaveBeenCalled();
  });

  it('leaves any other failure on the mutation for the dialog\'s own inline line: no error dialog, no toast', async () => {
    const toast = vi.spyOn(errorToast, 'showErrorToast').mockImplementation(() => {});
    vi.spyOn(apiClient, 'post').mockRejectedValue(failure(500));
    const { result } = renderHook(() => useShareSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate({ sessionId: 7, userIds: ['u-1'] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useSessionErrorDialogStore.getState().error).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
});
