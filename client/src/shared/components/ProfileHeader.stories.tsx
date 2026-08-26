import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileHeader } from './ProfileHeader';
import type { UserResponse } from '@/features/profile/types';

const baseUser: UserResponse = {
  id: 'user-1',
  email: 'bilal@example.com',
  firstName: 'Bilal',
  lastName: 'Nasser',
  username: 'bnasser',
  phoneNumber: null,
  dateOfBirth: null,
  gender: null,
  bio: 'Midfielder for FC Weekend Warriors, Sunday pickup regular at Riverside.',
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
  roles: ['USER'],
  createdAt: '2026-03-01T00:00:00',
  lastLoginAt: null,
  fullName: 'Bilal Nasser',
};

const meta = {
  title: 'Profile/ProfileHeader',
  component: ProfileHeader,
  args: {
    user: baseUser,
    onEditProfile: () => {},
  },
} satisfies Meta<typeof ProfileHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full data — avatar initials, handle line, bio all present. */
export const Default: Story = {};

/** `bio` is null — no bio paragraph rendered at all, not a placeholder. */
export const NoBio: Story = {
  args: { user: { ...baseUser, bio: null } },
};

/** `avatarUrl`/`coverUrl` both null — initials fallback, plain cover band. */
export const NoAvatarOrCover: Story = {
  args: { user: { ...baseUser, avatarUrl: null, coverUrl: null } },
};

/** `avatarUrl`/`coverUrl` both set — real images render. */
export const WithAvatarAndCover: Story = {
  args: {
    user: {
      ...baseUser,
      avatarUrl: 'https://i.pravatar.cc/150?u=bnasser',
      coverUrl: 'https://picsum.photos/seed/sporthub-cover/800/220',
    },
  },
};

/** `username`/`city` both null — the whole handle line is omitted. */
export const NoUsernameOrCity: Story = {
  args: { user: { ...baseUser, username: null, city: null } },
};
