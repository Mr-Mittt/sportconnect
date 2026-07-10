import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/app/authStore';
import { PublicOnlyRoute } from './PublicOnlyRoute';

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

function renderPublicOnly() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/" element={<div>Home Feed</div>} />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <div>Login form</div>
            </PublicOnlyRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicOnlyRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: true });
  });

  it('renders a loading state while bootstrapping, not a redirect', () => {
    renderPublicOnly();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Login form')).not.toBeInTheDocument();
  });

  it('renders children once bootstrap resolves with no user', () => {
    useAuthStore.setState({ isBootstrapping: false });
    renderPublicOnly();
    expect(screen.getByText('Login form')).toBeInTheDocument();
  });

  it('redirects an already-authenticated visitor to Home Feed instead of showing the form', () => {
    useAuthStore.setState({ user: fixtureUser, accessToken: 'token-abc', isBootstrapping: false });
    renderPublicOnly();
    expect(screen.getByText('Home Feed')).toBeInTheDocument();
    expect(screen.queryByText('Login form')).not.toBeInTheDocument();
  });
});
