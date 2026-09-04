import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useFriendsPageStore } from '@/app/friendsPageStore';
import { FriendsPage } from './FriendsPage';
import type { FriendRequest, FriendUser } from './types';

const testUser = {
  id: 'me',
  email: 'ben@example.com',
  firstName: 'Ben',
  lastName: 'Nyx',
  username: 'bennyx',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Wrapper that seeds router `location.state` as a clicked friend-request
 * notification does (CLIENT-NOTIF-5). `focusReason` mirrors the notification
 * type: `'created'` ("… wants to be your friend") or `'accepted'` ("… is now
 * your friend"). */
function focusWrapper(focusPersonId: string, focusReason?: 'created' | 'accepted') {
  return function FocusWrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/friends', state: { focusPersonId, focusReason } }]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function emptyPage() {
  return apiResponse({
    content: [],
    totalPages: 1,
    totalElements: 0,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 0,
    empty: true,
  });
}

const priya: FriendUser = { id: 'f1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: 'Weekend hooper.' };

const receivedRequest: FriendRequest = {
  requestId: 'req-1',
  senderId: 'f3',
  senderName: 'Hana Kim',
  receiverId: 'me',
  receiverName: 'Ben Nyx',
  status: 'PENDING',
  createdAt: '2026-07-20T00:00:00',
};

/** Static (test-invariant) GET responses — right rail's page-independent hooks.
 * CLIENT-SESSION-1: useUpcomingMatches (matches rail) is real now — /groups/user/
 * returning empty means no group-session fan-out, but /sessions/mine still fires. */
function staticGetResponse(url: string): { data: unknown } | undefined {
  if (url === '/hashtags/trending') return emptyPage();
  if (url === '/posts/broadcast') return emptyPage();
  if (url.startsWith('/groups/user/')) return emptyPage();
  if (url === '/sessions/mine') return emptyPage();
  if (url === '/sessions/discover') return emptyPage();
  if (url === '/sports/profiles') return apiResponse([]); // SPORT-11: caller-scoped (A22)
  return undefined;
}

function mockFriendsGet({
  friends = [priya],
  received = [receivedRequest],
}: { friends?: FriendUser[]; received?: FriendRequest[] } = {}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    const staticResponse = staticGetResponse(url);
    if (staticResponse) return staticResponse;
    if (url === '/users/friends') return apiResponse(friends);
    if (url === '/users/friends/requests/received') return apiResponse(received);
    if (url === '/users/friends/requests/sent') return apiResponse([]);
    // SPORT-11: `useUserInfo` now runs for every selection (known friends
    // included) and carries `activeSportIds` for the panel's sport pills;
    // no `/sports/profiles/...` request fires for another user anymore.
    if (url === '/users/f1') {
      return apiResponse({
        id: 'f1',
        fullName: 'Priya Shah',
        username: 'priyashah',
        avatarUrl: null,
        coverUrl: null,
        bio: 'Weekend hooper.',
        activeSportIds: [1, 3],
      });
    }
    if (url === '/users/f3') {
      return apiResponse({
        id: 'f3',
        fullName: 'Hana Kim',
        username: 'hanakim',
        avatarUrl: null,
        coverUrl: null,
        bio: null,
        activeSportIds: [],
      });
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useFriendsPageStore.setState({ query: '', isAddMode: false, selectedPersonId: undefined });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
  });

  it('renders the rail sections and the unchanged right rail cards', async () => {
    mockFriendsGet();
    render(<FriendsPage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    expect(screen.getByText('Hana Kim')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trending hashtags' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Group broadcasts' })).toBeInTheDocument();
    expect(screen.getByText('Select a friend to view their profile and chat.')).toBeInTheDocument();
  });

  it('selecting a friend shows the profile + chat split, with the Friend menu button (already friends)', async () => {
    mockFriendsGet();
    const user = userEvent.setup();
    render(<FriendsPage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    await user.click(screen.getByText('Priya Shah'));

    await waitFor(() => expect(screen.getByText('Weekend hooper.')).toBeInTheDocument());
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Friend' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send a friend request|waiting|accept|decline/i }),
    ).not.toBeInTheDocument();
  });

  it('selecting an incoming request shows Accept/Decline, and accepting calls the real endpoint', async () => {
    mockFriendsGet();
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(apiResponse(undefined));
    const user = userEvent.setup();
    render(<FriendsPage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Hana Kim')).toBeInTheDocument());
    await user.click(screen.getByText('Hana Kim'));

    const acceptButton = await screen.findByRole('button', { name: 'Accept' });
    await user.click(acceptButton);

    expect(putSpy).toHaveBeenCalledWith('/users/friends/requests/req-1/accept');
  });

  it('FRIEND-2: a friend-request notification arrival — accepting then unfriending does not re-open the unavailable dialog', async () => {
    const hana: FriendUser = { id: 'f3', fullName: 'Hana Kim', avatarUrl: null, coverUrl: null, bio: null };
    let phase: 'request' | 'friend' | 'removed' = 'request';
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/users/friends') return apiResponse(phase === 'friend' ? [priya, hana] : [priya]);
      if (url === '/users/friends/requests/received') {
        return apiResponse(phase === 'request' ? [receivedRequest] : []);
      }
      if (url === '/users/friends/requests/sent') return apiResponse([]);
      if (url === '/users/f3') return apiResponse({ ...hana, username: 'hanakim', activeSportIds: [3] });
      throw new Error(`unexpected GET ${url}`);
    });
    vi.spyOn(apiClient, 'put').mockImplementation(async () => {
      phase = 'friend';
      return apiResponse(undefined);
    });
    vi.spyOn(apiClient, 'delete').mockImplementation(async () => {
      phase = 'removed';
      return apiResponse(undefined);
    });
    const user = userEvent.setup();
    render(<FriendsPage />, { wrapper: focusWrapper('f3') });

    // arrives pre-selected on Hana's incoming request
    await user.click(await screen.findByRole('button', { name: 'Accept' }));

    // now a friend — the Friend menu button
    await user.click(await screen.findByRole('button', { name: 'Friend' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unfriend' }));
    await user.click(screen.getByRole('button', { name: 'Unfriend' }));

    await waitFor(() =>
      expect(screen.getByText('Select a friend to view their profile and chat.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Friend request unavailable')).not.toBeInTheDocument();
  });

  it('FRIEND-2: an outdated "X is now your friend" notification (they unfriended since) lands quietly — no unavailable dialog', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/users/friends') return apiResponse([priya]); // f3 is NOT a friend
      if (url === '/users/friends/requests/received') return apiResponse([]);
      if (url === '/users/friends/requests/sent') return apiResponse([]);
      if (url === '/users/f3') {
        return apiResponse({
          id: 'f3',
          fullName: 'Hana Kim',
          username: 'hanakim',
          avatarUrl: null,
          coverUrl: null,
          bio: null,
          activeSportIds: [],
        });
      }
      throw new Error(`unexpected GET ${url}`);
    });
    render(<FriendsPage />, { wrapper: focusWrapper('f3', 'accepted') });

    await waitFor(() =>
      expect(screen.getByText('Select a friend to view their profile and chat.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Friend request unavailable')).not.toBeInTheDocument();
  });

  it('Add friend mode searches the real directory and sends a request', async () => {
    mockFriendsGet();
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      const staticResponse = staticGetResponse(url);
      if (staticResponse) return staticResponse;
      if (url === '/users/friends') return apiResponse([priya]);
      if (url === '/users/friends/requests/received') return apiResponse([]);
      if (url === '/users/friends/requests/sent') return apiResponse([]);
      if (url === '/users/search') {
        const keyword = config?.params?.q as string;
        return apiResponse({
          content:
            keyword.toLowerCase() === 'owen'
              ? [
                  {
                    id: 'u1',
                    fullName: 'Owen Clarke',
                    username: 'owenc',
                    avatarUrl: null,
                    city: null,
                    country: null,
                    friendshipStatus: 'NONE',
                  },
                ]
              : [],
          totalPages: 1,
          totalElements: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          numberOfElements: 1,
          empty: false,
        });
      }
      if (url === '/users/u1') {
        return apiResponse({
          id: 'u1',
          fullName: 'Owen Clarke',
          username: 'owenc',
          avatarUrl: null,
          coverUrl: null,
          bio: null,
          activeSportIds: [1],
        });
      }
      throw new Error(`unexpected GET ${url}`);
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue(apiResponse(undefined));
    const user = userEvent.setup();

    render(<FriendsPage />, { wrapper });
    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add friend' }));
    await user.type(screen.getByRole('textbox', { name: 'Search friends' }), 'Owen');

    await waitFor(() => expect(screen.getByText('Owen Clarke')).toBeInTheDocument(), { timeout: 2000 });
    await user.click(screen.getByText('Owen Clarke'));

    const sendButton = await screen.findByRole('button', { name: 'Send a friend request' });
    await user.click(sendButton);

    expect(postSpy).toHaveBeenCalledWith('/users/friends/requests', { receiverId: 'u1' });
  });

  // CLIENT-SESSION-7: this page's upcoming matches are already empty by default (staticGetResponse
  // above), and it has no sport switcher to anchor a modal below — the ModalAnchorProvider added
  // for this ticket anchors to the page's own sr-only h1 instead.
  it('empty upcoming matches: "Create a match"/"Join a match" open their own modals', async () => {
    mockFriendsGet();
    const user = userEvent.setup();
    render(<FriendsPage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    expect(screen.getByText('No upcoming matches.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create a match' }));
    expect(await screen.findByRole('dialog', { name: 'Create your session' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create your session' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Join a match' }));
    expect(await screen.findByRole('dialog', { name: 'Discover sessions' })).toBeInTheDocument();
  });
});
