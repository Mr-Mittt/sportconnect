import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { routes } from '@/router';

/**
 * ADMIN-1: the /admin route's guard, exercised through the **real** route tree
 * (`routes` from router.tsx) rather than a hand-built one. A local tree would
 * prove ProtectedRoute works in isolation while saying nothing about whether
 * /admin is actually nested under it — which is the mistake most likely to be
 * made here.
 *
 * This is ProtectedRoute's first use of `requiredRole`, so the role branch had
 * never executed anywhere before these tests.
 *
 * Provider setup mirrors App.test.tsx's `renderApp`: RootLayout calls
 * useSessionBootstrap() on mount, so a QueryClientProvider is mandatory even
 * though this ticket fetches nothing of its own.
 */

const adminUser = {
  id: '1',
  email: 'admin@admin.admin',
  firstName: 'Admin',
  lastName: 'User',
  username: 'admin',
  phoneNumber: null,
  avatarUrl: null,
  // Deliberately both, matching how a real admin is provisioned: registration
  // grants USER and ADMIN is added on top. An ADMIN-only account would fail
  // every hasRole('USER') endpoint in the app.
  roles: ['USER', 'ADMIN'],
};

const normalUser = { ...adminUser, id: '2', email: 'jordan@example.com', roles: ['USER'] };

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/admin route guard (ADMIN-1)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
    // No MSW in Vitest (MSW-0) — default to "no valid session" so the bootstrap
    // refresh doesn't hit the network. Tests that want a user set it directly on
    // the store, same as App.test.tsx.
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('no session'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading state while bootstrapping instead of deciding early', () => {
    // Without this, an admin hard-refreshing on /admin would be bounced to
    // /login while the refresh-cookie check was still in flight.
    renderAt('/admin');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('renders the admin shell for a user holding ADMIN', async () => {
    useAuthStore.setState({ user: adminUser, accessToken: 'token', isBootstrapping: false });

    renderAt('/admin');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument(),
    );
  });

  it('renders the section index at /admin with no child route selected', async () => {
    useAuthStore.setState({ user: adminUser, accessToken: 'token', isBootstrapping: false });

    renderAt('/admin');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sections' })).toBeInTheDocument(),
    );
    // ADMIN-2 replaced ADMIN-1's "No admin sections are available yet." empty state
    // with the first real section link.
    expect(screen.getAllByRole('link', { name: 'Sports' }).length).toBeGreaterThan(0);
  });

  it('does not render the member-facing app chrome — admin sits outside AppShell', async () => {
    useAuthStore.setState({ user: adminUser, accessToken: 'token', isBootstrapping: false });

    renderAt('/admin');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('redirects a signed-in user without ADMIN to the home feed', async () => {
    useAuthStore.setState({ user: normalUser, accessToken: 'token', isBootstrapping: false });

    const router = renderAt('/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('redirects a logged-out visitor to /login carrying the attempted path', async () => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });

    const router = renderAt('/admin');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    // state.from is what lets LoginPage bounce the user back to /admin after
    // signing in, rather than dumping them on the home feed.
    expect(router.state.location.state).toMatchObject({ from: '/admin' });
  });
});

/**
 * ADMIN-4: the logout control in AdminLayout's header, and the unsaved-changes
 * guard in front of it.
 *
 * Rendered through the same real `routes` tree as the guard tests above, and
 * deliberately so: the guard depends on `AdminSportsPage` reporting dirty state
 * up to `AdminLayout` through outlet context, and outlet context only exists
 * when the two are genuinely nested. `useAdminOutletContext` falls back to a
 * no-op when the context is absent (so ADMIN-2's standalone page tests keep
 * working), which means a mis-nested route would silently disable the guard —
 * these tests are what catches that, because only here is the nesting real.
 */
describe('logout from /admin (ADMIN-4)', () => {
  function apiResponse<T>(data: T) {
    return { data: { success: true, message: '', data, timestamp: '' } };
  }

  /**
   * RootLayout's useSessionBootstrap POSTs /auth/refresh on mount, so the post spy is
   * never empty — "no request fired" has to mean "no *logout* request fired", not "no
   * calls at all", or the assertion passes/fails for unrelated reasons.
   *
   * Paired with a `mockClear()` immediately before the click under test: `vi.spyOn` on an
   * already-spied method returns the existing spy rather than re-wrapping, so call history
   * survives into later tests in this file and a cumulative assertion reports a logout that
   * a *previous* test fired. Clearing first scopes each assertion to the click it is about.
   */
  function logoutCalls(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.filter(([url]) => url === '/auth/logout');
  }

  const badminton = {
    id: 1,
    name: 'Badminton',
    description: null,
    category: 'Racket',
    iconUrl: null,
    minPlayers: 2,
    maxPlayers: 4,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const badmintonSchema = {
    defaultLocale: 'en',
    groups: [
      {
        key: 'gear',
        label: { en: 'Gear' },
        isAvailable: true,
        order: 1,
        attributes: [{ key: 'racketBrand', label: { en: 'Racket brand' }, type: 'STRING' }],
      },
    ],
  };

  /** The sport catalogue + schema reads AdminSportsPage needs to render its forms. */
  function mockSportReads() {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/sports/all') return apiResponse([badminton]);
      if (url === '/sports/all/1/attribute-schema') return apiResponse(badmintonSchema);
      throw new Error(`unexpected GET ${url}`);
    });
  }

  beforeEach(() => {
    useAuthStore.setState({ user: adminUser, accessToken: 'token', isBootstrapping: false });
  });

  it('logs out and clears the session', async () => {
    const user = userEvent.setup();
    // The outer beforeEach mocks post() to reject; logout must clear the session
    // regardless (useLogout clears onSettled, success or failure), so this doubles
    // as the offline case.
    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));

    renderAt('/admin');
    await screen.findByRole('heading', { name: 'Admin' });

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(postSpy).toHaveBeenCalledWith('/auth/logout');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('is reachable from a nested admin route, not just /admin', async () => {
    mockSportReads();

    renderAt('/admin/sports/1');

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('warns before discarding unsaved edits, and fires no request', async () => {
    const user = userEvent.setup();
    mockSportReads();
    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));

    renderAt('/admin/sports/1');

    const nameField = await screen.findByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'Badminton Doubles');

    postSpy.mockClear();

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    // Dialog instead of a logout — and critically, nothing was sent.
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();
    expect(logoutCalls(postSpy)).toHaveLength(0);
    expect(useAuthStore.getState().user).not.toBeNull();
  });

  it('discards and logs out when the admin confirms', async () => {
    const user = userEvent.setup();
    mockSportReads();
    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));

    renderAt('/admin/sports/1');

    const nameField = await screen.findByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'Badminton Doubles');

    postSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Unsaved changes');

    await user.click(screen.getByRole('button', { name: 'Discard & log out' }));

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(postSpy).toHaveBeenCalledWith('/auth/logout');
  });

  it('cancels without logging out, leaving the edits in place', async () => {
    const user = userEvent.setup();
    mockSportReads();
    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));

    renderAt('/admin/sports/1');

    const nameField = await screen.findByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'Badminton Doubles');

    postSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Unsaved changes');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(logoutCalls(postSpy)).toHaveLength(0);
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('Badminton Doubles');
  });

  it('does not warn when the forms are clean', async () => {
    const user = userEvent.setup();
    mockSportReads();
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));

    renderAt('/admin/sports/1');
    await screen.findByLabelText('Name');

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});
