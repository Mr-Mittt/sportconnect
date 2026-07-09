import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './app/apiClient';
import App from './App';

// App itself calls useSessionBootstrap() on mount (AUTH-3), and LoginPage/
// RegisterPage need TanStack Query too — main.tsx provides a
// QueryClientProvider at the real app root (outside App itself), so every
// test rendering <App /> must wrap it here to match production.
function renderApp(initialEntries: string[]) {
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
    // No MSW in Vitest (it's Playwright-only, see MSW-0) — mock the
    // session-bootstrap call so it resolves deterministically instead of
    // hitting a real network call in jsdom. Rejecting simulates "no valid
    // refresh cookie", the normal logged-out case these route tests run as.
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('no session'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders LoginPage on /login, outside AppShell (no TopBar/NavTabs)', () => {
    renderApp(['/login']);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText('SportHub')).toBeInTheDocument(); // the login page's own logo, not TopBar's
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('renders RegisterPage on /register, outside AppShell (no TopBar/NavTabs)', () => {
    renderApp(['/register']);
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.queryByText('SportHub')).toBeInTheDocument(); // the register page's own logo, not TopBar's
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('renders the assembled Home Feed on / (HF-7 replaced the placeholder)', () => {
    renderApp(['/']);
    expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
  });

  it('renders a stub route (Friends) on /friends', () => {
    renderApp(['/friends']);
    expect(screen.getByRole('heading', { name: 'Friends' })).toBeInTheDocument();
  });

  it('clicking a NavTab navigates and marks it active', async () => {
    const user = userEvent.setup();
    renderApp(['/']);
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
  });

  it('calls POST /auth/refresh on mount to restore the session (AUTH-3)', async () => {
    renderApp(['/']);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh'));
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
