import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
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

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

/**
 * CLIENT-REF-2: RegisterForm now wires `useGeoLocaleFieldsData()` itself (real TanStack Query
 * hooks), so rendering RegisterPage for real needs both a QueryClientProvider and the same
 * apiClient-mocking approach used elsewhere (no msw-storybook-addon/MSW in Vitest — see
 * RegisterForm.test.tsx/.stories.tsx). An all-null resolve keeps every existing assertion below
 * unaffected — the geo fields render disabled-until-loaded and stay empty.
 */
beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: unknown) => {
    const path = url as string;
    if (path === '/reference/languages') return apiResponse([]);
    if (path === '/reference/countries') return apiResponse([]);
    if (path.startsWith('/reference/countries/')) return apiResponse([]);
    throw new Error(`unexpected GET ${path}`);
  });
  vi.spyOn(apiClient, 'post').mockResolvedValue(
    apiResponse({ language: null, country: null, region: null, source: null }),
  );
});

function withProviders(children: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderAt(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  let capturedOnSuccess: ((user: User) => void) | undefined;
  vi.mocked(useRegister).mockImplementation((options) => {
    capturedOnSuccess = options?.onSuccess;
    return { register: vi.fn(), isPending: false, errorMessage: null, errorCode: null, errorFields: [] };
  });

  render(
    withProviders(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Home Feed</div>} />
          <Route path="/groups" element={<div>Groups</div>} />
        </Routes>
      </MemoryRouter>,
    ),
  );

  return { triggerSuccess: () => act(() => capturedOnSuccess?.(fixtureUser)) };
}

describe('RegisterPage', () => {
  it('renders the register form', () => {
    vi.mocked(useRegister).mockReturnValue({ register: vi.fn(), isPending: false, errorMessage: null, errorCode: null, errorFields: [] });

    render(
      withProviders(
        <MemoryRouter initialEntries={['/register']}>
          <RegisterPage />
        </MemoryRouter>,
      ),
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
