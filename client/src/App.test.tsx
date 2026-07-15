import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './app/apiClient';
import { useAuthStore } from './app/authStore';
import App from './App';

const fixtureUser = {
  id: '1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

const fixtureAuthResponse = {
  data: {
    success: true,
    message: 'Token refreshed successfully',
    data: { accessToken: 'token-abc', tokenType: 'Bearer', expiresIn: 3600, user: fixtureUser },
    timestamp: new Date().toISOString(),
  },
};

// App itself calls useSessionBootstrap() on mount (AUTH-3), and every route
// under AppShell is now gated by ProtectedRoute (AUTH-4) — main.tsx provides
// a QueryClientProvider at the real app root, so every test rendering
// <App /> must wrap it here to match production.
function renderApp(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  beforeEach(() => {
    // Reset the singleton authStore between tests — Zustand state doesn't
    // reset on its own between renders, unlike a fresh QueryClient per test.
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
    // No MSW in Vitest (Playwright-only, see MSW-0) — default to "no valid
    // session" so auth-page tests don't need an authenticated fixture.
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('no session'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders LoginPage on /login, outside AppShell (no TopBar/NavTabs)', async () => {
    renderApp(['/login']);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
    expect(screen.queryByText('SportHub')).toBeInTheDocument(); // the login page's own logo, not TopBar's
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('renders RegisterPage on /register, outside AppShell (no TopBar/NavTabs)', async () => {
    renderApp(['/register']);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument());
    expect(screen.queryByText('SportHub')).toBeInTheDocument(); // the register page's own logo, not TopBar's
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('redirects to /login when a logged-out visitor hits a protected route directly', async () => {
    renderApp(['/']);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
  });

  it('redirects an already-authenticated visitor away from /login to Home Feed', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    renderApp(['/login']);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('redirects an already-authenticated visitor away from /register to Home Feed', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    renderApp(['/register']);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Create your account' })).not.toBeInTheDocument();
  });

  it('renders the assembled Home Feed on / for an authenticated user (HF-7 replaced the placeholder)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    // FEED-1: the feed is real now (usePersonalFeed) — needs its own fixture,
    // separate from the auth bootstrap mock above.
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          content: [
            {
              id: 1,
              userId: 'someone-else',
              userFullName: 'Marcus Lee',
              userAvatarUrl: null,
              postType: 'USER_FEED',
              groupId: null,
              content: 'Great session tonight.',
              latitude: null,
              longitude: null,
              locationName: null,
              sportId: null,
              sportName: null,
              visibility: 'public',
              media: [],
              hashtags: [],
              previewComments: [],
              likeCount: 0,
              commentCount: 0,
              shareCount: 0,
              isLikedByCurrentUser: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              broadcastEndTime: null,
            },
          ],
          totalPages: 1,
          totalElements: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          numberOfElements: 1,
          empty: false,
        },
        timestamp: '',
      },
    });
    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
  });

  it('renders the assembled Groups page on /groups for an authenticated user (FEED-4)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/1') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              content: [
                {
                  id: 1,
                  sportId: 5,
                  groupName: 'Riverside Ballers',
                  description: null,
                  avatarUrl: null,
                  coverUrl: null,
                  isPrivate: false,
                  isActive: true,
                  createdBy: '1',
                  createdByFullName: 'Jordan Lee',
                  memberCount: 5,
                  currentUserRole: 'MEMBER',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  pinnedPosts: null,
                },
              ],
              totalPages: 1,
              totalElements: 1,
              number: 0,
              size: 20,
              first: true,
              last: true,
              numberOfElements: 1,
              empty: false,
            },
            timestamp: '',
          },
        };
      }
      return {
        data: {
          success: true,
          message: '',
          data: {
            content: [],
            totalPages: 1,
            totalElements: 0,
            number: 0,
            size: 20,
            first: true,
            last: true,
            numberOfElements: 0,
            empty: true,
          },
          timestamp: '',
        },
      };
    });

    renderApp(['/groups']);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('group', { name: 'Group filter' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Riverside Ballers/ })).toBeInTheDocument();
    // "All" is selected by default — no single group to post into yet.
    expect(screen.queryByLabelText('Create a post')).not.toBeInTheDocument();
  });

  it('selecting a group on /groups reveals the post composer', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/groups/user/1') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              content: [
                {
                  id: 1,
                  sportId: 5,
                  groupName: 'Riverside Ballers',
                  description: null,
                  avatarUrl: null,
                  coverUrl: null,
                  isPrivate: false,
                  isActive: true,
                  createdBy: '1',
                  createdByFullName: 'Jordan Lee',
                  memberCount: 5,
                  currentUserRole: 'MEMBER',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  pinnedPosts: null,
                },
              ],
              totalPages: 1,
              totalElements: 1,
              number: 0,
              size: 20,
              first: true,
              last: true,
              numberOfElements: 1,
              empty: false,
            },
            timestamp: '',
          },
        };
      }
      return {
        data: {
          success: true,
          message: '',
          data: {
            content: [],
            totalPages: 1,
            totalElements: 0,
            number: 0,
            size: 20,
            first: true,
            last: true,
            numberOfElements: 0,
            empty: true,
          },
          timestamp: '',
        },
      };
    });

    const user = userEvent.setup();
    renderApp(['/groups']);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Riverside Ballers/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Riverside Ballers/ }));

    await waitFor(() => expect(screen.getByLabelText('Create a post')).toBeInTheDocument());
  });

  it('renders a stub route (Friends) on /friends for an authenticated user', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    renderApp(['/friends']);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Friends' })).toBeInTheDocument());
  });

  it('clicking a NavTab navigates and marks it active', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    const user = userEvent.setup();
    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
  });

  it('calls POST /auth/refresh on mount to restore the session (AUTH-3)', async () => {
    renderApp(['/login']);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh'));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('logging out from the account menu clears the session and redirects to /login', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/auth/logout') {
        return Promise.resolve({
          data: { success: true, message: 'Logged out successfully', data: null, timestamp: new Date().toISOString() },
        });
      }
      return Promise.resolve(fixtureAuthResponse);
    });

    const user = userEvent.setup();
    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('redirects to /login for a protected route while logged out, and back to it after a successful login', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/auth/refresh') return Promise.reject(new Error('no session'));
      if (url === '/auth/login') return Promise.resolve(fixtureAuthResponse);
      return Promise.reject(new Error(`unexpected call: ${url}`));
    });

    const user = userEvent.setup();
    renderApp(['/groups']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email'), 'jordan@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument());
  });
});
