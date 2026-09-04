import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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

/** `mySessions` seeds `/sessions/mine` (the "My sessions" panel); `discoverSessions` seeds
 * `/sessions/discover` (the Discover grid) — most tests only care about one or the other.
 * `sportProfiles` defaults to the module-level fixture (one active Basketball profile) —
 * overridden to `[]` by the zero-sport-profile gate test below. */
function mockGet({
  mySessions = [],
  discoverSessions = [],
  sportProfiles: sportProfilesOverride = sportProfiles,
}: {
  mySessions?: unknown[];
  discoverSessions?: unknown[];
  sportProfiles?: unknown[];
}) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/sports/profiles') return apiResponse(sportProfilesOverride);
    if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
    if (url === '/sessions/mine') return apiResponse(pageResponse(mySessions));
    if (url === '/sessions/discover') return apiResponse(pageResponse(discoverSessions));
    if (url === '/sessions/joined') return apiResponse(pageResponse([]));
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
    // Explicit unmount before clearing the session (CLIENT-SESSION-8): Vitest runs afterEach
    // hooks inside-out (this file's hook before src/test/setup.ts's global `cleanup()`), so
    // without this, MatchesPage briefly re-renders with authStore.user === null while still
    // mounted — and it non-null-asserts user (guaranteed by ProtectedRoute in the real app),
    // which throws. Same fix HomeFeedPage.test.tsx/FriendsPage.test.tsx already apply.
    cleanup();
    useAuthStore.setState({ user: null, accessToken: null, isBootstrapping: false });
  });

  it('renders the My sessions panel from /sessions/mine', async () => {
    mockGet({ mySessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
  });

  it('renders the Discover grid from /sessions/discover', async () => {
    mockGet({ discoverSessions: [session({ id: 2, title: 'Evening scrimmage' })] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('Evening scrimmage')).toBeInTheDocument();
  });

  it('shows empty states when there are no sessions in either panel', async () => {
    mockGet({});
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('No sessions to discover for this sport yet.')).toBeInTheDocument();
    expect(screen.getByText("You haven't created or joined any sessions yet.")).toBeInTheDocument();
  });

  it('opens the create session dialog from the "Create session" pill', async () => {
    const user = userEvent.setup();
    mockGet({});
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('No sessions to discover for this sport yet.');

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('heading', { name: 'Create your session' })).toBeInTheDocument();
  });

  it('clicking a My sessions card opens the detail dialog', async () => {
    const user = userEvent.setup();
    mockGet({ mySessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');

    await user.click(screen.getByRole('button', { name: /Sunday pickup run — View details/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });

  it('clicking a Discover card opens the detail dialog', async () => {
    const user = userEvent.setup();
    mockGet({ discoverSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');

    await user.click(screen.getByRole('button', { name: /Sunday pickup run — View details/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });

  it('pre-opens the detail dialog from the ?session= deep link', async () => {
    mockGet({ mySessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches?session=1') });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });

  it('the "Hide my sessions" toggle collapses the My sessions panel', async () => {
    const user = userEvent.setup();
    mockGet({ mySessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');

    expect(screen.getByRole('region', { name: 'My sessions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide my sessions' }));
    expect(screen.queryByRole('region', { name: 'My sessions' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show my sessions' }));
    expect(screen.getByRole('region', { name: 'My sessions' })).toBeInTheDocument();
  });

  it('the search input filters the Discover grid by title', async () => {
    const user = userEvent.setup();
    mockGet({
      discoverSessions: [session({ id: 1, title: 'Sunday pickup run' }), session({ id: 2, title: 'Evening scrimmage' })],
    });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');
    expect(screen.getByText('Evening scrimmage')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Search sessions' }), 'pickup');

    expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
    expect(screen.queryByText('Evening scrimmage')).not.toBeInTheDocument();
  });

  it('auto-opens the Add sport modal on page load when the caller has zero sport profiles', async () => {
    mockGet({ sportProfiles: [] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    const dialog = await screen.findByRole('dialog', { name: 'Add a sport' });
    expect(within(dialog).getByText(/add a sport first/i)).toBeInTheDocument();
  });

  it('does not open the Add sport modal when the caller already has a sport profile', async () => {
    mockGet({ mySessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    await screen.findByText('Sunday pickup run');
    expect(screen.queryByRole('dialog', { name: 'Add a sport' })).not.toBeInTheDocument();
  });
});
