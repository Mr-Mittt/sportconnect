import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
