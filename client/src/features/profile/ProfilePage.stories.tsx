import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { userEvent, within } from 'storybook/test';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { ProfilePage } from './ProfilePage';
import type { UserResponse } from './types';

const storyUser = {
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
  bio: 'Midfielder, weekend regular at Riverside.',
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

const footballPost = {
  id: 1,
  userId: 'user-1',
  userFullName: 'Jordan Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great turnout for Sunday pickup — same time next week?',
  latitude: null,
  longitude: null,
  locationName: null,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 4,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: '2026-08-01T00:00:00',
  updatedAt: '2026-08-01T00:00:00',
  broadcastEndTime: null,
  sportId: 5,
};

/**
 * PROFILE-6: no msw-storybook-addon is wired into this repo's `.storybook/`
 * (verified — every other component's `.stories.tsx` with a real data hook
 * either takes props directly or has no API-backed hook at all), so this
 * story-scoped fixture map replaces `apiClient.get` directly, same GET-url
 * dispatch shape `ProfilePage.test.tsx` already uses. Reassigned once at
 * module scope — Storybook renders one story canvas at a time, so this is
 * safe the same way `AdminLayout.stories.tsx`'s shared `QueryClientProvider`
 * wrapper is.
 */
function mockGet(url: string): { data: unknown } {
  if (url === '/users/me') return apiResponse(profileFixture);
  if (url === '/sports/profiles') return apiResponse([footballProfile]);
  if (url === '/sports') return apiResponse([{ id: 5, name: 'Football', iconUrl: null }]);
  if (url === '/posts/mine') return apiResponse({ ...emptyPage().data.data, content: [footballPost] });
  if (url === '/hashtags/trending') return emptyPage();
  if (url === '/posts/broadcast') return emptyPage();
  if (url === '/groups/user/user-1') return emptyPage();
  if (url === '/sessions/mine') return emptyPage();
  if (url === '/sports/5/attribute-schema') return apiResponse(null);
  throw new Error(`unexpected GET ${url}`);
}
apiClient.get = (async (url: string) => mockGet(url)) as typeof apiClient.get;
useAuthStore.getState().setSession(storyUser, 'story-access-token');

const meta = {
  title: 'Profile/ProfilePage',
  component: ProfilePage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ProfilePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default tab on load — the caller's own posts, composer, right rail. */
export const Posts: Story = {};

/** PROFILE-3: no backend concept exists yet — `ComingSoonPage` placeholder. */
export const Memories: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Memories' }));
  },
};

/** PROFILE-4: per-sport profile editor, hosting SPORT-2's `SportAttributesFields`. */
export const Settings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Settings' }));
  },
};
