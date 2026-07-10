import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { useLogin } from './useLogin';
import type { User } from './types';

vi.mock('./useLogin');

const fixtureUser: User = {
  id: '1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['USER'],
};

function renderAt(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  let capturedOnSuccess: ((user: User) => void) | undefined;
  vi.mocked(useLogin).mockImplementation((options) => {
    capturedOnSuccess = options?.onSuccess;
    return { login: vi.fn(), isPending: false, errorMessage: null };
  });

  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home Feed</div>} />
        <Route path="/groups" element={<div>Groups</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { triggerSuccess: () => act(() => capturedOnSuccess?.(fixtureUser)) };
}

describe('LoginPage', () => {
  it('renders the login form', () => {
    vi.mocked(useLogin).mockReturnValue({ login: vi.fn(), isPending: false, errorMessage: null });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('redirects to / once useLogin reports success, when no redirect target was set', () => {
    const { triggerSuccess } = renderAt(['/login']);
    triggerSuccess();
    expect(screen.getByText('Home Feed')).toBeInTheDocument();
  });

  it('redirects back to the originally attempted URL (ProtectedRoute redirect-back)', () => {
    const { triggerSuccess } = renderAt([{ pathname: '/login', state: { from: '/groups' } }]);
    triggerSuccess();
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });
});
