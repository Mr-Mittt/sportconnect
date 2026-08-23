import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useCreateSessionModalData } from './useCreateSessionModalData';
import { useDiscoverModalData } from './useDiscoverModalData';

/**
 * CLIENT-MODAL-1, session half.
 *
 * These hooks own both the mutation and the close handler, so the reset lives here and
 * one test covers every page that consumes them — `HomeFeedPage`, `GroupsPage`,
 * `FriendsPage` and `MatchesPage` for the create modal, three of those for discover.
 *
 * The invariant under test is the ticket's: a failed submit must not survive a
 * close/reopen cycle. Asserted on the hook's own error flag rather than on rendered text,
 * because that flag *is* the prop the dialogs render from — `isCreateError` feeds
 * `CreateSessionModal`'s `isError`, and it was the flag, not the markup, that leaked.
 */

const testUser = {
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

beforeEach(() => {
  useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreateSessionModalData — create error does not survive close (CLIENT-MODAL-1)', () => {
  it('clears isCreateError when the modal closes', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('create failed'));
    // SPORT-5 made these hooks read the sport catalogue (they refetch it when their modal
    // opens), and GET /sports returns an array — a blanket page-shaped mock makes the catalogue
    // hook map over a non-array and throw.
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => ({
      data: {
        success: true,
        message: '',
        data: url === '/sports' ? [] : { content: [] },
        timestamp: '',
      },
    }));

    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });

    act(() => result.current.openCreateModal());
    act(() =>
      result.current.submitCreate({
        sportId: 5,
        title: 'Sunday game',
        locationId: 1,
        scheduledStart: '2026-09-01T10:00:00',
        capacity: 10,
        feeType: 'FREE',
      }),
    );

    await waitFor(() => expect(result.current.isCreateError).toBe(true));

    act(() => result.current.closeCreateModal());

    // Before the fix this stayed true, so reopening rendered the previous failure
    // immediately — the modal's own `key` remount only ever cleared its fields.
    expect(result.current.isCreateError).toBe(false);

    act(() => result.current.openCreateModal());
    expect(result.current.isCreateError).toBe(false);
  });
});

describe('useDiscoverModalData — session action errors do not cross sessions (CLIENT-MODAL-1)', () => {
  it('clears join/leave/cancel errors when the detail dialog closes', async () => {
    // SPORT-5 made these hooks read the sport catalogue (they refetch it when their modal
    // opens), and GET /sports returns an array — a blanket page-shaped mock makes the catalogue
    // hook map over a non-array and throw.
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => ({
      data: {
        success: true,
        message: '',
        data: url === '/sports' ? [] : { content: [] },
        timestamp: '',
      },
    }));
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('join failed'));

    const { result } = renderHook(() => useDiscoverModalData(undefined), { wrapper });

    act(() => result.current.onViewDetails(1));
    act(() => result.current.onJoin());

    await waitFor(() => expect(result.current.isJoinError).toBe(true));

    act(() => result.current.closeDetail());

    // Worse than a plain stale error here: this dialog reopens for a *different*
    // session, so without the reset session 2 would render session 1's join failure.
    expect(result.current.isJoinError).toBe(false);

    act(() => result.current.onViewDetails(2));
    expect(result.current.isJoinError).toBe(false);
  });
});
