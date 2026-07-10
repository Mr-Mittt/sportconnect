import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/app/authStore';
import { ProtectedRoute } from './ProtectedRoute';

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

function renderProtected(initialEntry: string, requiredRole?: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home Feed</div>} />
        <Route
          path="/groups"
          element={
            <ProtectedRoute requiredRole={requiredRole}>
              <div>Groups page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
  });

  it('renders a loading state while bootstrapping, not a redirect', () => {
    renderProtected('/groups');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects to /login once bootstrap resolves with no user', () => {
    useAuthStore.setState({ isBootstrapping: false });
    renderProtected('/groups');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders children once bootstrap resolves with a user', () => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    renderProtected('/groups');
    expect(screen.getByText('Groups page')).toBeInTheDocument();
  });

  it('redirects to / when requiredRole is not in user.roles', () => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    renderProtected('/groups', 'ADMIN');
    expect(screen.getByText('Home Feed')).toBeInTheDocument();
  });

  it('renders children when requiredRole is satisfied', () => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    renderProtected('/groups', 'USER');
    expect(screen.getByText('Groups page')).toBeInTheDocument();
  });
});
