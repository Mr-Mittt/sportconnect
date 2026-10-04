import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocaleStore } from '@/app/localeStore';
import { NotFoundPage, RouteErrorPage } from './RouteErrorPages';

function httpError(status: number): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST');
  error.response = { status, data: { message: 'server text' } } as AxiosResponse;
  return error;
}

function Boom({ error }: { error: unknown }): never {
  throw error;
}

function renderApp(initialEntries: string[], throwing?: unknown, withCatchAll = true) {
  const router = createMemoryRouter(
    [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/', element: <div>Home page</div> },
          { path: '/boom', element: <Boom error={throwing} /> },
          ...(withCatchAll ? [{ path: '*', element: <NotFoundPage /> }] : []),
        ],
      },
    ],
    { initialEntries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotFoundPage (catch-all route)', () => {
  it('shows the not-found screen for an unknown URL and goes home from its action', async () => {
    const router = renderApp(['/no/such/page']);

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });

  it('is localized', () => {
    useLocaleStore.getState().setLocale('vi');
    renderApp(['/no/such/page']);

    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });
});

describe('RouteErrorPage (errorElement)', () => {
  it('shows not-found for a router 404 when no catch-all exists', () => {
    renderApp(['/missing'], undefined, false);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it.each([
    [403, 'No access', 'Back to home'],
    [404, 'No longer available', 'Back to home'],
    [500, "Couldn't load this", 'Try again'],
  ])('maps a thrown API %i to its screen', (status, title, action) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(['/boom'], httpError(status));

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
  });

  it('maps a thrown network failure to the offline screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(['/boom'], new AxiosError('Network Error', 'ERR_NETWORK'));

    expect(screen.getByRole('heading', { name: 'You seem to be offline' })).toBeInTheDocument();
  });

  it('shows the crash screen, with Reload, for any other thrown error and logs it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(['/boom'], new TypeError('render blew up'));

    expect(screen.getByRole('heading', { name: 'Something broke' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('goes home from a forbidden screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = renderApp(['/boom'], httpError(403));

    await userEvent.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(router.state.location.pathname).toBe('/');
  });
});
