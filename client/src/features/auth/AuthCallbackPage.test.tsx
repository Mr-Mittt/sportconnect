import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { AuthCallbackPage } from './AuthCallbackPage';
import { savePkceState } from './pkce';

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

const session = {
  data: {
    success: true,
    message: 'ok',
    data: { accessToken: 'token-xyz', tokenType: 'Bearer', expiresIn: 300, user: fixtureUser },
    timestamp: new Date().toISOString(),
  },
};

function deactivated() {
  return {
    isAxiosError: true,
    response: {
      status: 401,
      data: {
        success: false,
        message: 'deactivated',
        errorCode: 'ACCOUNT_DEACTIVATED',
        errorParams: { reactivationTicket: 'ticket-1' },
        timestamp: new Date().toISOString(),
      },
    },
  };
}

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function renderCallback(search = '?code=abc&state=s1') {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
    vi.restoreAllMocks();
    savePkceState({ codeVerifier: 'verifier-1', state: 's1', returnTo: '/groups' });
  });

  it('exchanges the code once, populates the session and returns to the saved path', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce(session);
    renderCallback();

    expect(screen.getByRole('status')).toHaveTextContent('Signing you in…');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/groups'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/auth/callback', { code: 'abc', codeVerifier: 'verifier-1' });
    expect(useAuthStore.getState().accessToken).toBe('token-xyz');
    expect(sessionStorage.getItem('sportconnect.pkce')).toBeNull();
  });

  it('refuses a state that does not match, without calling the backend', async () => {
    const post = vi.spyOn(apiClient, 'post');
    renderCallback('?code=abc&state=other');

    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in link expired or was already used');
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the same error when Keycloak sends an error parameter or nothing was stored', async () => {
    const post = vi.spyOn(apiClient, 'post');
    renderCallback('?error=access_denied&state=s1');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the localized backend failure with a way to start over', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { success: false, message: 'bad', errorCode: 'AUTH_CODE_INVALID' } },
    });
    renderCallback();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in link expired or was already used');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('opens the re-activate dialog for a deactivated password user; Confirm re-activates and enters the app', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce(deactivated())
      .mockResolvedValueOnce(session);
    renderCallback();

    expect(await screen.findByRole('dialog', { name: 'Re-activate your account?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Re-activate' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/groups'));
    expect(post).toHaveBeenLastCalledWith('/auth/reactivate', { ticket: 'ticket-1' });
    expect(useAuthStore.getState().accessToken).toBe('token-xyz');
  });

  it('Cancel declines with the ticket and returns to /login without a session', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce(deactivated())
      .mockResolvedValueOnce({ data: { success: true, message: 'ok', data: null, timestamp: '' } });
    renderCallback();

    await screen.findByRole('dialog', { name: 'Re-activate your account?' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
    expect(post).toHaveBeenLastCalledWith('/auth/reactivate/cancel', { ticket: 'ticket-1' });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
