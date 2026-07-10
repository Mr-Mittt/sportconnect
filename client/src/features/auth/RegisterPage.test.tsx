import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';
import { useRegister } from './useRegister';
import type { User } from './types';

vi.mock('./useRegister');

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
  vi.mocked(useRegister).mockImplementation((options) => {
    capturedOnSuccess = options?.onSuccess;
    return { register: vi.fn(), isPending: false, errorMessage: null };
  });

  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div>Home Feed</div>} />
        <Route path="/groups" element={<div>Groups</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { triggerSuccess: () => act(() => capturedOnSuccess?.(fixtureUser)) };
}

describe('RegisterPage', () => {
  it('renders the register form', () => {
    vi.mocked(useRegister).mockReturnValue({ register: vi.fn(), isPending: false, errorMessage: null });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('redirects to / once useRegister reports success, when no redirect target was set', () => {
    const { triggerSuccess } = renderAt(['/register']);
    triggerSuccess();
    expect(screen.getByText('Home Feed')).toBeInTheDocument();
  });

  it('redirects back to the originally attempted URL (ProtectedRoute redirect-back)', () => {
    const { triggerSuccess } = renderAt([{ pathname: '/register', state: { from: '/groups' } }]);
    triggerSuccess();
    expect(screen.getByText('Groups')).toBeInTheDocument();
  });
});
