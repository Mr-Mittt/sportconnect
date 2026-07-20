import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Group } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { GroupCoverBanner } from './GroupCoverBanner';

const group: Group = {
  id: 1,
  sportId: 5,
  groupName: 'Riverside Ballers',
  description: null,
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  memberCount: 42,
  currentUserRole: 'group_member',
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
  pinnedPosts: null,
};

const sport: SportProfile = { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' };

// Self-contained placeholder photo (no network dependency) — a simple green
// gradient standing in for a real uploaded cover.
const placeholderCoverUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='160'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23085041'/%3E%3Cstop offset='100%25' stop-color='%231f8f6f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='160' fill='url(%23g)'/%3E%3C/svg%3E";

const meta = {
  title: 'Groups/GroupCoverBanner',
  component: GroupCoverBanner,
  args: {
    group,
    sport,
    onBack: () => {},
  },
} satisfies Meta<typeof GroupCoverBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Sport can't be resolved (e.g. still loading) — falls back to initials, neutral styling. */
export const UnresolvedSport: Story = {
  args: { sport: undefined },
};

/** A real cover photo — replaces the sport-ramp band background. */
export const WithCoverPhoto: Story = {
  args: { group: { ...group, coverUrl: placeholderCoverUrl } },
};
