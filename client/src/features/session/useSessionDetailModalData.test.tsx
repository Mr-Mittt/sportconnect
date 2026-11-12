import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { Session } from '@/shared/types/session';
import { makeSession } from './components/sessionListFixtures';
import { useSessionDetailModalData } from './useSessionDetailModalData';

/**
 * CLIENT-SESSION-34: the detail hook's save and schedule flow — a host's per-section save, and the
 * confirmation popup that opens by itself when that save completes the last missing field.
 */

const host = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The session the detail query returns; `put` answers with the same session merged with `after`. */
function mockServer(current: Session, after: Partial<Session>) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url === '/sports' || url === '/sports/profiles') data = [];
    else if (url.endsWith('/session-attribute-schema')) data = null;
    else if (url === `/sessions/${current.id}`) data = current;
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
    data: { success: true, message: '', data: { ...current, ...after }, timestamp: '' },
  });
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
    data: { success: true, message: '', data: { ...current, status: 'SCHEDULED' }, timestamp: '' },
  });
  return { put, post };
}

/** PREPARING, created by the test user (so `canManage`), missing only the fee. */
const missingFee = makeSession({
  id: 5,
  status: 'PREPARING',
  feeType: null,
  scheduledEndAt: '2026-08-05T20:30:00',
});

beforeEach(() => {
  useAuthStore.setState({ user: host, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openDetail(session: Session) {
  const hook = renderHook(() => useSessionDetailModalData(session.id), { wrapper });
  await waitFor(() => expect(hook.result.current.selectedSession).toBeDefined());
  return hook;
}

describe('useSessionDetailModalData — saving a section and scheduling (CLIENT-SESSION-34)', () => {
  it('sends the section payload to PUT and then runs onDone', async () => {
    const { put } = mockServer(missingFee, { feeType: 'FREE' });
    const { result } = await openDetail(missingFee);
    const onDone = vi.fn();

    act(() => result.current.onUpdateSession({ feeType: 'FREE' }, onDone));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('/sessions/5', { feeType: 'FREE' });
  });

  it('opens the schedule confirmation by itself when the save completes the last missing field', async () => {
    mockServer(missingFee, { feeType: 'FREE' });
    const { result } = await openDetail(missingFee);
    expect(result.current.isScheduleConfirmOpen).toBe(false);

    act(() => result.current.onUpdateSession({ feeType: 'FREE' }, () => {}));

    await waitFor(() => expect(result.current.isScheduleConfirmOpen).toBe(true));
  });

  it('does not open it while something is still missing after the save', async () => {
    mockServer(missingFee, { scheduledEndAt: null, feeType: 'FREE' });
    const { result } = await openDetail(missingFee);
    const onDone = vi.fn();

    act(() => result.current.onUpdateSession({ feeType: 'FREE' }, onDone));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(result.current.isScheduleConfirmOpen).toBe(false);
  });

  it('does not open it for an edit of a session that already had nothing missing', async () => {
    const ready = { ...missingFee, feeType: 'FREE' as const };
    mockServer(ready, { title: 'New title' });
    const { result } = await openDetail(ready);
    const onDone = vi.fn();

    act(() => result.current.onUpdateSession({ title: 'New title' }, onDone));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(result.current.isScheduleConfirmOpen).toBe(false);
  });

  it('onSchedule posts to /schedule and closes the confirmation on success', async () => {
    const ready = { ...missingFee, feeType: 'FREE' as const };
    const { post } = mockServer(ready, {});
    const { result } = await openDetail(ready);

    act(() => result.current.onScheduleConfirmOpenChange(true));
    expect(result.current.isScheduleConfirmOpen).toBe(true);
    act(() => result.current.onSchedule());

    await waitFor(() => expect(result.current.isScheduleConfirmOpen).toBe(false));
    expect(post).toHaveBeenCalledWith('/sessions/5/schedule');
  });

  it('a failed schedule keeps the confirmation open and reports the failure', async () => {
    const ready = { ...missingFee, feeType: 'FREE' as const };
    mockServer(ready, {});
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('not ready'));
    const { result } = await openDetail(ready);

    act(() => result.current.onScheduleConfirmOpenChange(true));
    act(() => result.current.onSchedule());

    await waitFor(() => expect(result.current.isScheduleError).toBe(true));
    expect(result.current.isScheduleConfirmOpen).toBe(true);
  });

  it('closing the detail resets the confirmation and the schedule failure', async () => {
    const ready = { ...missingFee, feeType: 'FREE' as const };
    mockServer(ready, {});
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('not ready'));
    const { result } = await openDetail(ready);
    act(() => result.current.onScheduleConfirmOpenChange(true));
    act(() => result.current.onSchedule());
    await waitFor(() => expect(result.current.isScheduleError).toBe(true));

    act(() => result.current.resetActionErrors());

    expect(result.current.isScheduleError).toBe(false);
    expect(result.current.isScheduleConfirmOpen).toBe(false);
  });
});
