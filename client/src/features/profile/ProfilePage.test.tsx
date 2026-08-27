import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
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
function staticGetResponse(url: string): { data: unknown } | undefined {
  if (url === '/users/user-1') return apiResponse(profileFixture);
  if (url === '/sports/profiles/user/user-1') {
    return apiResponse([footballProfile, basketballProfile]);
  }
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

function mockProfileGet(posts: Post[]) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    const staticResponse = staticGetResponse(url);
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
});
