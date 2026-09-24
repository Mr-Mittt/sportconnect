import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useJoinFeedbackStore } from '@/app/joinFeedbackStore';
import type { ParticipantStatus } from '@/shared/types/session';
import { sessionKeys } from '../queryKeys';
import { useJoinSession } from './useJoinSession';

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function sessionWithStatus(status: ParticipantStatus | null) {
  return {
    data: {
      success: true,
      message: '',
      timestamp: '',
      data: { id: 7, callerParticipation: status === null ? null : { status } },
    },
  };
}

describe('useJoinSession (CLIENT-SESSION-30 feedback pop-up)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useJoinFeedbackStore.setState({ kind: null, openSessionId: null });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} });
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens the "joined" pop-up when the caller ends up JOINED, and primes the detail cache', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sessionWithStatus('JOINED'));
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(useJoinFeedbackStore.getState().kind).toBe('JOINED'));
    expect(apiClient.post).toHaveBeenCalledWith('/sessions/7/join');
    expect(apiClient.get).toHaveBeenCalledWith('/sessions/7');
    expect(queryClient.getQueryData(sessionKeys.detail(7))).toMatchObject({ id: 7 });
  });

  it('offers no session to open by default (the join came from the detail itself)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sessionWithStatus('JOINED'));
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(useJoinFeedbackStore.getState().kind).toBe('JOINED'));
    expect(useJoinFeedbackStore.getState().openSessionId).toBeNull();
  });

  it('remembers the session id for "Open session" when offerOpenSession is set (a card-driven join)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sessionWithStatus('REQUESTED'));
    const { result } = renderHook(() => useJoinSession({ offerOpenSession: true }), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate(7);

    await waitFor(() => expect(useJoinFeedbackStore.getState().kind).toBe('REQUESTED'));
    expect(useJoinFeedbackStore.getState().openSessionId).toBe(7);
  });

  it('opens the "request sent" pop-up when the caller ends up REQUESTED', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sessionWithStatus('REQUESTED'));
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(useJoinFeedbackStore.getState().kind).toBe('REQUESTED'));
  });

  it('shows no pop-up when the read-back has no JOINED/REQUESTED status', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sessionWithStatus(null));
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useJoinFeedbackStore.getState().kind).toBeNull();
  });

  it('still succeeds, silently, when the read-back fails — the join itself went through', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useJoinFeedbackStore.getState().kind).toBeNull();
  });

  it('fails without a pop-up when the join itself is rejected', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('400'));
    const getSpy = vi.spyOn(apiClient, 'get');
    const { result } = renderHook(() => useJoinSession(), { wrapper: createWrapper(queryClient) });

    result.current.mutate(7);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getSpy).not.toHaveBeenCalled();
    expect(useJoinFeedbackStore.getState().kind).toBeNull();
  });
});
