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

/**
 * These hooks read a handful of `GET`s when their modal opens — `/sports` (catalogue, array),
 * `/sports/profiles` (CLIENT-SESSION-15, array), `/sports/:id/session-attribute-schema`
 * (CLIENT-SESSION-15, schema-or-null) — plus paginated (`{content}`) lists for everything else.
 * Shape each correctly or the consuming hook maps over the wrong type and throws.
 */
function mockSportShapedGet(
  sessionSchemas: Record<string, unknown> = {},
): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    let data: unknown = { content: [] };
    if (url === '/sports' || url === '/sports/profiles') data = [];
    else if (url.endsWith('/session-attribute-schema')) {
      const sportId = url.split('/')[2];
      data = sessionSchemas[sportId] ?? null;
    }
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
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
    mockSportShapedGet();

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
    mockSportShapedGet();
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

describe('useCreateSessionModalData — session attributes (CLIENT-SESSION-15)', () => {
  const sessionSchema = {
    groups: [
      {
        key: 'match',
        label: 'Match details',
        isAvailable: true,
        attributes: [
          { key: 'racketBrand', label: 'Racket brand', type: 'STRING', isAvailable: true },
        ],
      },
    ],
  };

  it('folds the trimmed attributes draft into the create payload', async () => {
    mockSportShapedGet({ '1': sessionSchema });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { id: 99 } } });

    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });
    act(() => result.current.openCreateModal());
    act(() => result.current.onEffectiveSportChangeForCreate(1));
    await waitFor(() => expect(result.current.sessionAttributeSchema).not.toBeNull());

    act(() => result.current.onSessionAttributeChange('match/racketBrand', 'Yonex'));
    // a stale key from another sport must not reach the payload
    act(() => result.current.onSessionAttributeChange('other/x', 'stale'));

    act(() =>
      result.current.submitCreate({
        sportId: 1,
        title: 'Sunday game',
        locationId: 1,
        scheduledStart: '2026-09-01T10:00:00',
        capacity: 10,
        feeType: 'FREE',
      }),
    );

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as { attributes?: Record<string, unknown> };
    expect(body.attributes).toEqual({ 'match/racketBrand': 'Yonex' });
  });

  it('omits attributes entirely when the draft is empty', async () => {
    mockSportShapedGet({ '1': sessionSchema });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { id: 99 } } });

    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });
    act(() => result.current.openCreateModal());
    act(() => result.current.onEffectiveSportChangeForCreate(1));
    await waitFor(() => expect(result.current.sessionAttributeSchema).not.toBeNull());

    act(() =>
      result.current.submitCreate({
        sportId: 1,
        title: 'Sunday game',
        locationId: 1,
        scheduledStart: '2026-09-01T10:00:00',
        capacity: 10,
        feeType: 'FREE',
      }),
    );

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as { attributes?: Record<string, unknown> };
    expect(body.attributes).toBeUndefined();
  });

  it('clears the attributes draft and the chosen location when the sport changes', () => {
    mockSportShapedGet({ '1': sessionSchema, '2': sessionSchema });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { id: 99 } } });

    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });
    act(() => result.current.openCreateModal());
    act(() => result.current.onEffectiveSportChangeForCreate(1));
    act(() => result.current.onSessionAttributeChange('match/racketBrand', 'Yonex'));
    act(() =>
      result.current.onSelectLocationForCreate({ id: 7, name: 'Court 7' } as never),
    );
    expect(result.current.sessionAttributeValues).toEqual({ 'match/racketBrand': 'Yonex' });
    expect(result.current.selectedLocationForCreate).not.toBeNull();

    act(() => result.current.onEffectiveSportChangeForCreate(2));

    expect(result.current.sessionAttributeValues).toEqual({});
    expect(result.current.selectedLocationForCreate).toBeNull();
  });

  it('clears the attributes draft on close', () => {
    mockSportShapedGet({ '1': sessionSchema });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: { id: 99 } } });

    const { result } = renderHook(() => useCreateSessionModalData(), { wrapper });
    act(() => result.current.openCreateModal());
    act(() => result.current.onEffectiveSportChangeForCreate(1));
    act(() => result.current.onSessionAttributeChange('match/racketBrand', 'Yonex'));
    expect(result.current.sessionAttributeValues).toEqual({ 'match/racketBrand': 'Yonex' });

    act(() => result.current.closeCreateModal());
    expect(result.current.sessionAttributeValues).toEqual({});
  });
});
