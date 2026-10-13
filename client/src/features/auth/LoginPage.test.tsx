import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountNoticeStore } from './accountNoticeStore';
import { LoginPage } from './LoginPage';
import { useLogin } from './useLogin';
import { useReactivate } from './useReactivate';
import type { LoginPayload, User } from './types';

vi.mock('./useLogin');
vi.mock('./useReactivate');

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

const credentials: LoginPayload = { email: 'jordan@example.com', password: 'password123' };

const reactivate = vi.fn();
const resetReactivate = vi.fn();

let captured: {
  onSuccess?: (user: User) => void;
  onAccountDeactivated?: (payload: LoginPayload) => void;
  onReactivateSuccess?: (user: User) => void;
};

function mockHooks(reactivateState: { isPending?: boolean; errorMessage?: string | null } = {}) {
  captured = {};
  vi.mocked(useLogin).mockImplementation((options) => {
    captured.onSuccess = options?.onSuccess;
    captured.onAccountDeactivated = options?.onAccountDeactivated;
    return { login: vi.fn(), isPending: false, errorMessage: null };
  });
  vi.mocked(useReactivate).mockImplementation((options) => {
    captured.onReactivateSuccess = options?.onSuccess;
    return {
      reactivate,
      isPending: reactivateState.isPending ?? false,
      errorMessage: reactivateState.errorMessage ?? null,
      reset: resetReactivate,
    };
  });
}

function renderAt(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  mockHooks();
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home Feed</div>} />
        <Route path="/groups" element={<div>Groups</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { triggerSuccess: () => act(() => captured.onSuccess?.(fixtureUser)) };
}

describe('LoginPage', () => {
  beforeEach(() => {
    reactivate.mockClear();
    resetReactivate.mockClear();
  });

  it('renders the login form', () => {
    renderAt(['/login']);

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

  describe('arriving after the user deactivated their own account (ACCOUNT-4)', () => {
    afterEach(() => useAccountNoticeStore.getState().setDeactivated(false));

    it('shows the re-activate hint while the notice flag is set, and clears it on sign-in', () => {
      useAccountNoticeStore.getState().setDeactivated(true);
      const { triggerSuccess } = renderAt(['/login']);

      expect(screen.getByRole('status')).toHaveTextContent('re-activate');
      triggerSuccess();
      expect(useAccountNoticeStore.getState().deactivated).toBe(false);
    });

    it('shows no hint on a normal visit', () => {
      renderAt(['/login']);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('re-activating a deactivated account (AUTH-10)', () => {
    it('shows no dialog until login answers ACCOUNT_DEACTIVATED', () => {
      renderAt(['/login']);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the dialog, and Confirm re-sends the credentials just typed', async () => {
      renderAt(['/login']);
      act(() => captured.onAccountDeactivated?.(credentials));

      expect(screen.getByRole('dialog', { name: 'Re-activate your account?' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Re-activate' }));
      expect(reactivate).toHaveBeenCalledWith(credentials);
    });

    it('Cancel closes the dialog, sends nothing and resets the mutation', async () => {
      renderAt(['/login']);
      act(() => captured.onAccountDeactivated?.(credentials));

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(reactivate).not.toHaveBeenCalled();
      expect(resetReactivate).toHaveBeenCalled();
    });

    it('Esc closes the dialog the same way', async () => {
      renderAt(['/login']);
      act(() => captured.onAccountDeactivated?.(credentials));

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(reactivate).not.toHaveBeenCalled();
    });

    it('drops the credentials once the dialog is closed: reopening needs a fresh login attempt', async () => {
      renderAt(['/login']);
      act(() => captured.onAccountDeactivated?.(credentials));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('button', { name: 'Re-activate' })).not.toBeInTheDocument();
      expect(reactivate).not.toHaveBeenCalled();
    });

    it('shows a failed re-activation inside the dialog, which stays open', () => {
      mockHooks({ errorMessage: 'Invalid email or password.' });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>,
      );
      act(() => captured.onAccountDeactivated?.(credentials));

      expect(screen.getByRole('dialog')).toHaveTextContent('Invalid email or password.');
    });

    it('navigates into the app once re-activation succeeds', () => {
      renderAt(['/login']);
      act(() => captured.onAccountDeactivated?.(credentials));
      act(() => captured.onReactivateSuccess?.(fixtureUser));

      expect(screen.getByText('Home Feed')).toBeInTheDocument();
    });
  });
});
