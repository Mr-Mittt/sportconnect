import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useMatchesPageStore } from '@/app/matchesPageStore';
import { MatchesPage } from './MatchesPage';

const testUser = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  avatarUrl: null,
  roles: ['ROLE_USER'],
};

function wrapperFor(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/matches" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function pageResponse<T>(content: T[]) {
  return {
    content,
    totalPages: 1,
    totalElements: content.length,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

const sportProfiles = [
  {
    id: 1,
    userId: 'user-1',
    sportId: 6,
    sportName: 'Basketball',
    skillLevel: null,
    yearsOfExperience: null,
    preferredPosition: null,
    bio: null,
    attributes: null,
    isActive: true,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  },
];

const location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: null,
  latitude: null,
  longitude: null,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: null,
    location,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

function mockGet(sessions: unknown[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
    if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
    if (url === '/sessions/mine') return apiResponse(pageResponse(sessions));
    if (url === '/sessions/1') return apiResponse(session());
    if (url === '/sessions/1/participants') return apiResponse(pageResponse([]));
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('MatchesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    useMatchesPageStore.setState({ activeSport: 'all' });
  });

  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('renders the session list', async () => {
    mockGet([session()]);
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
  });

  it('shows an empty state when there are no sessions', async () => {
    mockGet([]);
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('No sessions for this sport yet.')).toBeInTheDocument();
  });

  it('opens the create session dialog from the "Create session" pill', async () => {
    const user = userEvent.setup();
    mockGet([]);
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('No sessions for this sport yet.');

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('heading', { name: 'Create your session' })).toBeInTheDocument();
  });

  it('clicking a session card opens the detail dialog', async () => {
    const user = userEvent.setup();
    mockGet([session()]);
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');

    await user.click(screen.getByRole('button', { name: /Sunday pickup run/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });

  it('pre-opens the detail dialog from the ?session= deep link', async () => {
    mockGet([session()]);
    render(<MatchesPage />, { wrapper: wrapperFor('/matches?session=1') });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });
});
