import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { LoginPage } from './LoginPage';
import { ResetPasswordPage } from './ResetPasswordPage';

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/login', element: <LoginPage /> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function failure(status: number, errorCode: string): AxiosError {
  const response = {
    status,
    data: { success: false, message: 'x', errorCode, data: null, timestamp: '' },
  } as AxiosResponse;
  return new AxiosError('failed', String(status), undefined, undefined, response);
}

/** The page-load check and the submit both go through `apiClient.post`; answer each by URL. */
function mockApi(handlers: { validate?: () => Promise<unknown>; reset?: () => Promise<unknown> }) {
  const ok = () => Promise.resolve({ data: { success: true, data: null } });
  return vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
    if (url === '/auth/reset-password/validate') return (handlers.validate ?? ok)() as never;
    if (url === '/auth/reset-password') return (handlers.reset ?? ok)() as never;
    throw new Error(`unexpected POST ${url}`);
  });
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('New password'), 'newpassword1');
  await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
  await user.click(screen.getByRole('button', { name: 'Update password' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the invalid-link state straight away, with no request, when the token is missing', () => {
    const post = mockApi({});
    renderAt('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent('This reset link isn’t valid');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows a checking state, then the form, when the server says the link is usable', async () => {
    mockApi({});
    renderAt('/reset-password?token=abc');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your link…');
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it('goes straight to the problem state when the check says the link is not valid', async () => {
    mockApi({ validate: () => Promise.reject(failure(404, 'RESET_TOKEN_INVALID')) });
    renderAt('/reset-password?token=abc');
    expect(await screen.findByRole('alert')).toHaveTextContent('has already been used or has expired');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('keeps the form usable when the check itself fails with a server error', async () => {
    mockApi({ validate: () => Promise.reject(failure(500, 'INTERNAL_ERROR')) });
    renderAt('/reset-password?token=abc');
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it('goes to /login with the notice after a successful reset', async () => {
    const post = mockApi({});
    const router = renderAt('/reset-password?token=abc');
    await fillAndSubmit();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(post).toHaveBeenCalledWith('/auth/reset-password', { token: 'abc', newPassword: 'newpassword1' });
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated. Sign in with your new password.');
  });

  it('swaps the form for the expired-link state when the submit answers RESET_TOKEN_EXPIRED', async () => {
    mockApi({ reset: () => Promise.reject(failure(400, 'RESET_TOKEN_EXPIRED')) });
    renderAt('/reset-password?token=abc');
    await fillAndSubmit();
    expect(await screen.findByText('This reset link has expired. Request a new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
  });
});
