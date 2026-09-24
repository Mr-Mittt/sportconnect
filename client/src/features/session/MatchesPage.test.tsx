import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

/** `upcomingSessions` seeds `/sessions/upcoming`, `historyDates`/`historyByDate` seed
 * `/sessions/history` (the `dateCount` shape and each date's own `date` list — CLIENT-SESSION-23's
 * two "My sessions" sections); `discoverSessions` seeds `/sessions/discover` (the Discover grid) —
 * most tests only care about one or two of them.
 * `sportProfiles` defaults to the module-level fixture (one active Basketball profile) —
 * overridden to `[]` by the zero-sport-profile gate test below. */
/** Real DTO shape for `discoverSessions` fixtures — subset with a `title`, so
 * `/sessions/discover`'s mock below can simulate the real backend's server-side `title` filter. */
interface DiscoverSessionFixture {
  id: number;
  title: string;
}

function mockGet({
  upcomingSessions = [],
  historyDates = [],
  historyByDate = {},
  discoverSessions = [],
  sportProfiles: sportProfilesOverride = sportProfiles,
}: {
  upcomingSessions?: unknown[];
  historyDates?: { date: string; count: number }[];
  historyByDate?: Record<string, unknown[]>;
  discoverSessions?: unknown[];
  sportProfiles?: unknown[];
}) {
  return vi
    .spyOn(apiClient, 'get')
    .mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/sports/profiles') return apiResponse(sportProfilesOverride);
      if (url === '/groups/user/user-1') return apiResponse(pageResponse([]));
      if (url === '/sessions/upcoming') return apiResponse(pageResponse(upcomingSessions));
      if (url === '/sessions/history') {
        return config?.params?.dateCount !== undefined
          ? apiResponse({ dates: historyDates, hasMore: false })
          : apiResponse(pageResponse(historyByDate[config?.params?.date as string] ?? []));
      }
      if (url === '/sessions/discover') {
        const title = config?.params?.title as string | undefined;
        const filtered =
          title === undefined
            ? discoverSessions
            : (discoverSessions as DiscoverSessionFixture[]).filter((s) => s.title.includes(title));
        return apiResponse(pageResponse(filtered));
      }
      if (url === '/sessions/discover/counts') return apiResponse({ counts: [] });
      if (url === '/sessions/1') return apiResponse(session());
      if (url === '/sessions/1/participants') return apiResponse(pageResponse([]));
      throw new Error(`unexpected GET ${url}`);
    });
}

describe('MatchesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: testUser, accessToken: 'token', isBootstrapping: false });
    // CLIENT-SESSION-29 (2026-09-23) — no 'all' state; null lets useMatchesActiveSport resolve
    // to the fixture's own single Basketball profile, same sportId every session fixture defaults
    // to, so nothing else in this file needs to change.
    useMatchesPageStore.setState({ activeSport: null });
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

  it('renders the Upcoming sessions section from /sessions/upcoming, scoped to the active sport', async () => {
    const spy = mockGet({ upcomingSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    const upcoming = await screen.findByRole('region', { name: 'Upcoming sessions' });
    expect(await within(upcoming).findByText('Sunday pickup run')).toBeInTheDocument();
    expect(within(upcoming).getByText('Riverside Courts')).toBeInTheDocument();
    // The fixture's single Basketball profile (sportId 6) is the active sport.
    expect(spy).toHaveBeenCalledWith('/sessions/upcoming', { params: { sportId: 6, page: 0, size: 20 } });
  });

  it('renders the History section as collapsed "<date> (<count>)" rows, and expanding one lazily loads that date\'s sessions', async () => {
    const user = userEvent.setup();
    const spy = mockGet({
      historyDates: [
        { date: '2026-09-14', count: 2 },
        { date: '2026-09-10', count: 1 },
      ],
      historyByDate: {
        '2026-09-14': [
          session({ id: 11, title: 'Morning run', status: 'COMPLETED' }),
          session({ id: 12, title: 'Cancelled game', status: 'CANCELLED' }),
        ],
      },
    });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    const history = await screen.findByRole('region', { name: 'History' });
    const row = await within(history).findByRole('button', { name: 'Expand Sep 14, 2026 (2)' });
    expect(row).toHaveTextContent('Sep 14, 2026 (2)');
    expect(within(history).getByRole('button', { name: 'Expand Sep 10, 2026 (1)' })).toBeInTheDocument();
    // Collapsed by default: no date's own sessions have been requested yet.
    expect(spy.mock.calls.some(([url, config]) => url === '/sessions/history' && config?.params?.date !== undefined)).toBe(false);
    expect(within(history).queryByText('Morning run')).not.toBeInTheDocument();

    await user.click(row);
    expect(await within(history).findByText('Morning run')).toBeInTheDocument();
    expect(within(history).getByText('Cancelled game')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('/sessions/history', {
      params: expect.objectContaining({ date: '2026-09-14', sportId: 6, page: 0, size: 20 }),
    });

    await user.click(within(history).getByRole('button', { name: 'Collapse Sep 14, 2026 (2)' }));
    expect(within(history).queryByText('Morning run')).not.toBeInTheDocument();
  });

  it('Upcoming and History are independent — one can be empty while the other has content', async () => {
    mockGet({ upcomingSessions: [], historyDates: [{ date: '2026-09-14', count: 1 }] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    const upcoming = await screen.findByRole('region', { name: 'Upcoming sessions' });
    expect(await within(upcoming).findByText('You have no upcoming sessions.')).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'History' });
    expect(await within(history).findByRole('button', { name: 'Expand Sep 14, 2026 (1)' })).toBeInTheDocument();
    expect(within(history).queryByText('No session history yet.')).not.toBeInTheDocument();
  });

  it('renders the Discover grid from /sessions/discover', async () => {
    mockGet({ discoverSessions: [session({ id: 2, title: 'Evening scrimmage' })] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('Evening scrimmage')).toBeInTheDocument();
  });

  it('shows empty states when there are no sessions in either panel', async () => {
    mockGet({});
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    expect(await screen.findByText('No sessions to discover on Today.')).toBeInTheDocument();
    expect(screen.getByText('You have no upcoming sessions.')).toBeInTheDocument();
    expect(screen.getByText('No session history yet.')).toBeInTheDocument();
  });

  it('opens the create session dialog from the "Create session" pill', async () => {
    const user = userEvent.setup();
    mockGet({});
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('No sessions to discover on Today.');

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('heading', { name: 'Create your session' })).toBeInTheDocument();
  });

  it('clicking an Upcoming sessions card opens the detail dialog', async () => {
    const user = userEvent.setup();
    mockGet({ upcomingSessions: [session()] });
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
    mockGet({ upcomingSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches?session=1') });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Riverside Courts')).toBeInTheDocument();
  });

  it('the "Hide my sessions" toggle collapses the whole panel — both Upcoming and History', async () => {
    const user = userEvent.setup();
    mockGet({ upcomingSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });
    await screen.findByText('Sunday pickup run');

    expect(screen.getByRole('region', { name: 'My sessions' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Upcoming sessions' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'History' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide my sessions' }));
    expect(screen.queryByRole('region', { name: 'My sessions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Upcoming sessions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'History' })).not.toBeInTheDocument();

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

    // Debounced (400ms) before the server-side `title` param actually fires — one `waitFor` for
    // both assertions together, since the refetch's own brief loading state can otherwise satisfy
    // "Evening scrimmage is gone" a render early, before "Sunday pickup run" reappears.
    await waitFor(
      () => {
        expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
        expect(screen.queryByText('Evening scrimmage')).not.toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('auto-opens the Add sport modal on page load when the caller has zero sport profiles', async () => {
    mockGet({ sportProfiles: [] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    const dialog = await screen.findByRole('dialog', { name: 'Add a sport' });
    expect(within(dialog).getByText(/add a sport first/i)).toBeInTheDocument();
  });

  it('does not open the Add sport modal when the caller already has a sport profile', async () => {
    mockGet({ upcomingSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    await screen.findByText('Sunday pickup run');
    expect(screen.queryByRole('dialog', { name: 'Add a sport' })).not.toBeInTheDocument();
  });

  // CLIENT-SESSION-29 (2026-09-23, user decision) — /matches drops the "All" sport pill; the
  // sport switcher only ever offers real sports, defaulting to the caller's first profile.
  it('has no "All" sport pill, defaulting to the first sport profile as active', async () => {
    mockGet({ upcomingSessions: [session()] });
    render(<MatchesPage />, { wrapper: wrapperFor('/matches') });

    await screen.findByText('Sunday pickup run');
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
  });
});
