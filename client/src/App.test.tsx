import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './app/apiClient';
import { useAuthStore } from './app/authStore';
import { routes } from './router';

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

// RootLayout calls useSessionBootstrap() on mount (AUTH-3), and every route
// under AppShell is gated by ProtectedRoute (AUTH-4) — main.tsx provides a
// QueryClientProvider at the real app root, so every test rendering the
// route tree must wrap it here to match production. Builds its own
// createMemoryRouter from the same `routes` main.tsx's createBrowserRouter
// uses (ROUTER-1) — RouterProvider, not <MemoryRouter>, since useBlocker
// (GRP-2) only works with a data router.
function renderApp(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  const queryClient = new QueryClient();
  const memoryRouter = createMemoryRouter(routes, { initialEntries });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memoryRouter} />
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
    // SPORT-3: AppShell unconditionally fetches GET /sports and gates rendering on it — every
    // test that reaches an authenticated page needs this to resolve, not just the ones that
    // happen to care about sport data. Default here (any test with its own more specific
    // apiClient.get mock overrides this via its own vi.spyOn call, same composition as before).
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/sports') {
        return {
          data: {
            success: true,
            message: '',
            data: [
              { id: 5, name: 'Soccer', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 6, name: 'Basketball', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 2, name: 'Tennis', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
            ],
            timestamp: '',
          },
        };
      }
      throw new Error(`unmocked GET ${url} — this test needs its own apiClient.get mock for it`);
    });
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
    // separate from the auth bootstrap mock above. SPORT-1: sport profiles is
    // real too (GET /sports/profiles/user/{userId}) — an empty array is fine
    // here, this test only asserts the shell/feed render, not the switcher's cap.
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      // SPORT-3: AppShell now always fetches GET /sports (useSportCatalog) — every apiClient.get
      // mock in this file needs a branch for it, or the catch-all fallback below (shaped for a
      // different endpoint) breaks useSportCatalog's `.map()` over what it expects to be an array.
      if (url === '/sports') {
        return {
          data: {
            success: true,
            message: '',
            data: [
              { id: 5, name: 'Soccer', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 6, name: 'Basketball', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 2, name: 'Tennis', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
            ],
            timestamp: '',
          },
        };
      }
      if (url === '/sports/profiles/user/1') {
        return { data: { success: true, message: '', data: [], timestamp: '' } };
      }
      // FEED-6: real GET /hashtags/trending — an empty page here since this
      // test only asserts the shell/feed render, not the trending card.
      if (url === '/hashtags/trending') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              content: [],
              totalPages: 1,
              totalElements: 0,
              number: 0,
              size: 10,
              first: true,
              last: true,
              numberOfElements: 0,
              empty: true,
            },
            timestamp: '',
          },
        };
      }
      // FEED-7: real GET /posts/broadcast and GET /groups/user/{id} — both
      // empty; without these, they'd fall through to the post-shaped
      // fallback below and useGroupBroadcasts would crash trying to read
      // groupName off a Post it mistook for a Group.
      if (url === '/posts/broadcast' || url === '/groups/user/1') {
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
      }
      return {
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
      };
    });
    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
  });

  it('renders the assembled Groups page on /groups for an authenticated user (FEED-4)', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      // SPORT-3: AppShell now always fetches GET /sports (useSportCatalog) — every apiClient.get
      // mock in this file needs a branch for it, or the catch-all fallback below (shaped for a
      // different endpoint) breaks useSportCatalog's `.map()` over what it expects to be an array.
      if (url === '/sports') {
        return {
          data: {
            success: true,
            message: '',
            data: [
              { id: 5, name: 'Soccer', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 6, name: 'Basketball', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 2, name: 'Tennis', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
            ],
            timestamp: '',
          },
        };
      }
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
                  groupName: 'Downtown Strikers',
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
      if (url === '/sports/profiles/user/1') {
        // Non-empty — this test isn't about the zero-sport-profile page-access gate
        // (CLIENT-SESSION-7 follow-up); an empty fixture here would auto-open AddSportModal,
        // which aria-hides the rest of the page and breaks the getByRole queries below.
        return {
          data: {
            success: true,
            message: '',
            data: [
              {
                id: 1,
                userId: '1',
                sportId: 5,
                sportName: 'Soccer',
                skillLevel: null,
                yearsOfExperience: null,
                preferredPosition: null,
                bio: null,
                attributes: null,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
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
    // GRP-1: "Downtown Strikers" now appears twice (GroupSpaceSwitcher's pill
    // and GroupDiscoveryPanel's card, by design — see design-reference-
    // group-feed.html) — scope to the switcher specifically.
    const groupFilter = screen.getByRole('group', { name: 'Group filter' });
    expect(within(groupFilter).getByRole('button', { name: /Downtown Strikers/ })).toBeInTheDocument();
    // "All" is selected by default — no single group to post into yet.
    expect(screen.queryByLabelText('Create a post')).not.toBeInTheDocument();
  });

  it('selecting a group on /groups reveals the post composer', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(fixtureAuthResponse);
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      // SPORT-3: AppShell now always fetches GET /sports (useSportCatalog) — every apiClient.get
      // mock in this file needs a branch for it, or the catch-all fallback below (shaped for a
      // different endpoint) breaks useSportCatalog's `.map()` over what it expects to be an array.
      if (url === '/sports') {
        return {
          data: {
            success: true,
            message: '',
            data: [
              { id: 5, name: 'Soccer', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 6, name: 'Basketball', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
              { id: 2, name: 'Tennis', description: null, category: null, iconUrl: null, minPlayers: null, maxPlayers: null, isActive: true, createdAt: '', updatedAt: '' },
            ],
            timestamp: '',
          },
        };
      }
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
                  groupName: 'Downtown Strikers',
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
      if (url === '/sports/profiles/user/1') {
        // Non-empty — this test isn't about the zero-sport-profile page-access gate
        // (CLIENT-SESSION-7 follow-up); an empty fixture here would auto-open AddSportModal
        // and block the group-selection interaction this test actually exercises.
        return {
          data: {
            success: true,
            message: '',
            data: [
              {
                id: 1,
                userId: '1',
                sportId: 5,
                sportName: 'Soccer',
                skillLevel: null,
                yearsOfExperience: null,
                preferredPosition: null,
                bio: null,
                attributes: null,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
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

    // GRP-1: use the discovery panel's card (its accessible name is "Open
    // Downtown Strikers", distinct from the switcher pill's bare group
    // name) — exercises the panel's onOpenGroup path, not just the switcher.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open Downtown Strikers' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Open Downtown Strikers' }));

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
