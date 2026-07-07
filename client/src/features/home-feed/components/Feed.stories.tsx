import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Post } from '../types';
import { Feed } from './Feed';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: {
    key: 'basketball',
    label: 'Basketball',
    icon: 'ball-basketball',
    colorRamp: 'coral',
  },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const posts: Post[] = [
  {
    id: 'post-1',
    sport: 'football',
    authorName: 'Marcus Lee',
    authorInitials: 'ML',
    createdAt: hoursAgo(2),
    text: 'Great 5-a-side session tonight, 3 wins in a row for the squad.',
    hashtags: ['#5aside', '#fridayrun'],
    likeCount: 14,
    commentCount: 3,
    likedByMe: false,
  },
  {
    id: 'post-2',
    sport: 'basketball',
    authorName: 'Priya Shah',
    authorInitials: 'PS',
    createdAt: hoursAgo(4),
    text: 'Looking for 2 more players for Sunday pickup at Riverside courts.',
    hashtags: ['#pickup', '#riverside'],
    likeCount: 9,
    commentCount: 6,
    likedByMe: true,
  },
];

const meta = {
  title: 'HomeFeed/Feed',
  component: Feed,
  args: { sportsByKey, onToggleLike: () => {}, onHashtagClick: () => {} },
} satisfies Meta<typeof Feed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllSports: Story = {
  args: { posts, activeSport: 'all' },
};

export const FilteredBasketball: Story = {
  args: { posts, activeSport: 'basketball' },
};

export const EmptyForSport: Story = {
  args: { posts, activeSport: 'tennis' },
};
