import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportProfile } from '@/shared/types/sport';
import type { Post } from '../types';
import { PostCard } from './PostCard';

const football: SportProfile = {
  key: 'football',
  label: 'Football',
  icon: 'ball-football',
  colorRamp: 'teal',
};

const basePost: Post = {
  id: 'post-1',
  sport: 'football',
  authorName: 'Marcus Lee',
  authorInitials: 'ML',
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Great 5-a-side session tonight, 3 wins in a row for the squad.',
  hashtags: ['#5aside', '#fridayrun'],
  likeCount: 14,
  commentCount: 3,
  likedByMe: false,
};

const meta = {
  title: 'HomeFeed/PostCard',
  component: PostCard,
  args: { onToggleLike: () => {}, onHashtagClick: () => {} },
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unliked: Story = {
  args: { post: basePost, sport: football },
};

export const Liked: Story = {
  args: { post: { ...basePost, likedByMe: true, likeCount: 15 }, sport: football },
};

export const WithAvatarImage: Story = {
  args: {
    post: { ...basePost, authorAvatarUrl: 'https://i.pravatar.cc/72?img=12' },
    sport: football,
  },
};

export const LongTextManyTags: Story = {
  args: {
    post: {
      ...basePost,
      text: 'Post-season wrap-up: we played fourteen matches, won nine, drew three, and only dropped two — a huge step up from last year. Massive thanks to everyone who showed up to trainings in the rain and organized the logistics week after week.',
      hashtags: ['#wrapup', '#season2026', '#5aside', '#squadgoals', '#training', '#thanks'],
    },
    sport: football,
  },
};
