import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
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
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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

/** Static (test-invariant) GET responses — right rail's page-independent
 * hooks (matches stays mock, no HTTP call at all). */
function staticGetResponse(url: string): { data: unknown } | undefined {
  if (url === '/hashtags/trending') return emptyPage();
  if (url === '/posts/broadcast') return emptyPage();
  if (url.startsWith('/groups/user/')) return emptyPage();
  if (url === '/sports/profiles/user/me') return apiResponse([]);
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
    if (url === '/sports/profiles/user/f1' || url === '/sports/profiles/user/f3') return apiResponse([]);
    if (url === '/users/f3') {
      return apiResponse({ id: 'f3', fullName: 'Hana Kim', avatarUrl: null, coverUrl: null, bio: null });
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('FriendsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
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

  it('selecting a friend shows the profile + chat split, with no action bar (already friends)', async () => {
    mockFriendsGet();
    const user = userEvent.setup();
    render(<FriendsPage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Priya Shah')).toBeInTheDocument());
    await user.click(screen.getByText('Priya Shah'));

    await waitFor(() => expect(screen.getByText('Weekend hooper.')).toBeInTheDocument());
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
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
        return apiResponse({ id: 'u1', fullName: 'Owen Clarke', avatarUrl: null, coverUrl: null, bio: null });
      }
      if (url === '/sports/profiles/user/u1') return apiResponse([]);
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
});
