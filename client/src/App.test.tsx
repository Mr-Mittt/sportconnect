import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

// LoginPage's useLogin() needs a QueryClientProvider — main.tsx provides one
// at the real app root (outside App itself), so tests reaching /login must
// wrap it here too.
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
  it('renders LoginPage on /login, outside AppShell (no TopBar/NavTabs)', () => {
    renderApp(['/login']);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText('SportHub')).toBeInTheDocument(); // the login page's own logo, not TopBar's
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('renders the assembled Home Feed on / (HF-7 replaced the placeholder)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
  });

  it('renders a stub route (Friends) on /friends', () => {
    render(
      <MemoryRouter initialEntries={['/friends']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Friends' })).toBeInTheDocument();
  });

  it('clicking a NavTab navigates and marks it active', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
  });
});
