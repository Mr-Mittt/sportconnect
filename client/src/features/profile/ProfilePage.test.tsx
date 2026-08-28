import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useProfilePageStore } from '@/app/profilePageStore';
import type { Post } from '@/features/feed/types';
import type { UserResponse } from './types';
import { ProfilePage } from './ProfilePage';

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

const profileFixture: UserResponse = {
  id: 'user-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Lee',
  username: 'jordanlee',
  phoneNumber: null,
  dateOfBirth: null,
  gender: null,
  bio: 'Midfielder, weekend regular.',
  avatarUrl: null,
  coverUrl: null,
  location: null,
  city: 'Riverside',
  country: null,
  heightCm: null,
  weightKg: null,
  shoeSizeCm: null,
  isEmailVerified: true,
  isActive: true,
  roles: ['ROLE_USER'],
  createdAt: '2026-01-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Jordan Lee',
};

/**
 * `useUnsavedChangesGuard`'s `useBlocker` (PROFILE-10) requires a data router, unlike the plain
 * `<MemoryRouter>` this wrapper used before — same two-route memory-router shape
 * `useSettingsUnsavedGuard.test.tsx` (`features/groups/`) already established for this exact need.
 */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/', element: <>{children}</> },
      { path: '/elsewhere', element: <div>Elsewhere</div> },
    ],
    { initialEntries: ['/'] },
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

function emptyPage() {
  return apiResponse({
    content: [],
    totalPages: 1,
    totalElements: 0,
    number: 0,
    size: 20,
    first: true,
    last: true,
    numberOfElements: 0,
    empty: true,
  });
}

function post(overrides: Partial<Post> & Pick<Post, 'id' | 'content' | 'sportId'>): Post {
  return {
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    latitude: null,
    longitude: null,
    locationName: null,
    visibility: 'public',
    media: [],
    hashtags: [],
    previewComments: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: '2026-08-01T00:00:00',
    updatedAt: '2026-08-01T00:00:00',
    broadcastEndTime: null,
    ...overrides,
  };
}

const footballProfile = {
  id: 101,
  userId: 'user-1',
  sportId: 5,
  sportName: 'Football',
  skillLevel: 'beginner',
  yearsOfExperience: 2,
  preferredPosition: 'Midfielder',
  bio: null,
  attributes: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00',
  updatedAt: '2026-01-01T00:00:00',
};

const basketballProfile = {
  ...footballProfile,
  id: 102,
  sportId: 6,
  sportName: 'Basketball',
  skillLevel: 'advanced',
  preferredPosition: 'Guard',
};

/** Static (test-invariant) GET responses — same "right rail's page-independent hooks"
 * shape every other page-integration test (HomeFeedPage/FriendsPage) uses. */
function staticGetResponse(
  url: string,
  sportProfiles: typeof footballProfile[],
): { data: unknown } | undefined {
  if (url === '/users/me') return apiResponse(profileFixture);
  if (url === '/sports/profiles/user/user-1') return apiResponse(sportProfiles);
  if (url === '/sports') {
    return apiResponse([
      { id: 5, name: 'Football', iconUrl: null },
      { id: 6, name: 'Basketball', iconUrl: null },
      { id: 2, name: 'Tennis', iconUrl: null },
    ]);
  }
  if (url === '/hashtags/trending') return emptyPage();
  if (url === '/posts/broadcast') return emptyPage();
  if (url === '/groups/user/user-1') return emptyPage();
  if (url === '/sessions/mine') return emptyPage();
  if (url === '/sports/5/attribute-schema') return apiResponse(null);
  if (url === '/sports/6/attribute-schema') return apiResponse(null);
  return undefined;
}

function mockProfileGet(
  posts: Post[],
  { sportProfiles = [footballProfile, basketballProfile] }: { sportProfiles?: typeof footballProfile[] } = {},
) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    const staticResponse = staticGetResponse(url, sportProfiles);
    if (staticResponse) return staticResponse;
    if (url === '/posts/mine') return apiResponse({ ...emptyPage().data.data, content: posts });
    throw new Error(`unexpected GET ${url}`);
  });
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setSession(testUser, 'access-token');
    useProfilePageStore.setState({ activeSport: null });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
  });

  it('renders Posts by default and switches to Memories/Settings content on tab click', async () => {
    const user = userEvent.setup();
    mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
    render(<ProfilePage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Upcoming matches' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trending hashtags' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Group broadcasts' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Memories' }));
    expect(screen.getByRole('heading', { name: 'Memories' })).toBeInTheDocument();
    expect(screen.queryByText('Football post')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
  });

  it('propagates a SportSwitcher change to both Posts and Settings', async () => {
    const user = userEvent.setup();
    mockProfileGet([
      post({ id: 1, content: 'Football post', sportId: 5 }),
      post({ id: 2, content: 'Basketball post', sportId: 6 }),
    ]);
    render(<ProfilePage />, { wrapper });

    // Defaults to the first sport profile (Football) — PROFILE-4's useProfileActiveSport.
    await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
    expect(screen.queryByText('Basketball post')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Basketball/ }));

    await waitFor(() => expect(screen.getByText('Basketball post')).toBeInTheDocument());
    expect(screen.queryByText('Football post')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('advanced'));
  });

  it('auto-opens the Add sport modal on page load when the caller has zero sport profiles', async () => {
    mockProfileGet([], { sportProfiles: [] });
    render(<ProfilePage />, { wrapper });

    const dialog = await screen.findByRole('dialog', { name: 'Add a sport' });
    expect(within(dialog).getByText(/add a sport first/i)).toBeInTheDocument();
  });

  it('does not open the Add sport modal when the caller already has a sport profile', async () => {
    mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
    render(<ProfilePage />, { wrapper });

    await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Add a sport' })).not.toBeInTheDocument();
  });

  describe('Settings unsaved-changes guard (PROFILE-10)', () => {
    async function openSettingsAndEdit(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('tab', { name: 'Settings' }));
      await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
      await user.type(screen.getByLabelText('Preferred position'), ' Jr.');
    }

    it('blocks switching away from Settings via ProfileTabs while dirty, and Discard proceeds', async () => {
      const user = userEvent.setup();
      mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
      render(<ProfilePage />, { wrapper });
      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
      await openSettingsAndEdit(user);

      await user.click(screen.getByRole('tab', { name: 'Posts' }));

      const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
      expect(within(dialog).getByText(/unsaved changes to this sport profile/i)).toBeInTheDocument();
      // Blocked — still on Settings, still showing the edited value.
      expect(screen.getByLabelText('Preferred position')).toHaveValue('Midfielder Jr.');

      await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    });

    it('blocks switching the SportSwitcher pill while Settings is dirty, and Save proceeds once it succeeds', async () => {
      const user = userEvent.setup();
      mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
      const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
        data: {
          success: true,
          message: '',
          data: { ...footballProfile, preferredPosition: 'Midfielder Jr.' },
          timestamp: '',
        },
      });
      render(<ProfilePage />, { wrapper });
      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
      await openSettingsAndEdit(user);

      await user.click(screen.getByRole('button', { name: /Basketball/ }));

      const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
      // Blocked — still Football's data, the pill switch hasn't gone through yet.
      expect(screen.getByLabelText('Preferred position')).toHaveValue('Midfielder Jr.');

      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(putSpy).toHaveBeenCalledWith(
          '/sports/profiles/101',
          expect.objectContaining({ preferredPosition: 'Midfielder Jr.' }),
        ),
      );
      // The guarded pill switch now proceeds automatically once the save resolves.
      await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('advanced'));
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    });

    it('cancelling the dialog leaves the draft intact and stays on Settings', async () => {
      const user = userEvent.setup();
      mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
      render(<ProfilePage />, { wrapper });
      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
      await openSettingsAndEdit(user);

      await user.click(screen.getByRole('tab', { name: 'Posts' }));
      const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
      await user.click(within(dialog).getByRole('button', { name: /close|cancel/i }));

      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Preferred position')).toHaveValue('Midfielder Jr.');
    });

    it('does not block switching tabs/pills when Settings has no unsaved changes', async () => {
      const user = userEvent.setup();
      mockProfileGet([post({ id: 1, content: 'Football post', sportId: 5 })]);
      render(<ProfilePage />, { wrapper });
      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());

      await user.click(screen.getByRole('tab', { name: 'Settings' }));
      await waitFor(() => expect(screen.getByLabelText('Skill level')).toHaveValue('beginner'));
      await user.click(screen.getByRole('tab', { name: 'Posts' }));

      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('Football post')).toBeInTheDocument());
    });
  });
});
