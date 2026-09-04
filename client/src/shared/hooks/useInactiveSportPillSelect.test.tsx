import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useInactiveSportNudgeStore } from '@/app/inactiveSportNudgeStore';
import { useInactiveSportPillSelect } from './useInactiveSportPillSelect';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

describe('useInactiveSportPillSelect', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useInactiveSportNudgeStore.setState({ deferredSportKeys: [], deferredGroupIds: [] });
  });

  it('first click on an inactive sport opens the nudge without selecting it', () => {
    const onSelectSport = vi.fn();
    const { result } = renderHook(
      () => useInactiveSportPillSelect({ userId: 'user-1', onSelectSport }),
      { wrapper },
    );

    act(() => result.current.onInactiveSelect('football'));

    expect(result.current.nudge).not.toBeNull();
    expect(result.current.nudge?.mode).toBe('sport-pill');
    expect(result.current.nudge?.sportName).toBe('Football');
    expect(onSelectSport).not.toHaveBeenCalled();
  });

  it('"Later" selects the sport, defers it for the session, and closes the nudge', () => {
    const onSelectSport = vi.fn();
    const { result } = renderHook(
      () => useInactiveSportPillSelect({ userId: 'user-1', onSelectSport }),
      { wrapper },
    );

    act(() => result.current.onInactiveSelect('football'));
    act(() => result.current.nudge!.onLater());

    expect(onSelectSport).toHaveBeenCalledWith('football');
    expect(result.current.nudge).toBeNull();
    expect(useInactiveSportNudgeStore.getState().isSportDeferred('football')).toBe(true);
  });

  it('a sport already deferred this session selects straight through, no nudge', () => {
    useInactiveSportNudgeStore.setState({ deferredSportKeys: ['football'], deferredGroupIds: [] });
    const onSelectSport = vi.fn();
    const { result } = renderHook(
      () => useInactiveSportPillSelect({ userId: 'user-1', onSelectSport }),
      { wrapper },
    );

    act(() => result.current.onInactiveSelect('football'));

    expect(onSelectSport).toHaveBeenCalledWith('football');
    expect(result.current.nudge).toBeNull();
  });

  it('"Yes" reactivates via POST { isResume: true }, then selects the sport', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(
      apiResponse({ id: 9, sportId: 5, isActive: true }),
    );
    const onSelectSport = vi.fn();
    const { result } = renderHook(
      () => useInactiveSportPillSelect({ userId: 'user-1', onSelectSport }),
      { wrapper },
    );

    act(() => result.current.onInactiveSelect('football'));
    act(() => result.current.nudge!.onReactivate());

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/sports/profiles', {
      sportId: 5, // 'football' in the global test catalog
      isResume: true,
    }));
    await waitFor(() => expect(onSelectSport).toHaveBeenCalledWith('football'));
    await waitFor(() => expect(result.current.nudge).toBeNull());
  });
});
