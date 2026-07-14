import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { PostCard } from './PostCard';

const football: SportProfile = {
  key: 'football',
  label: 'Football',
  icon: 'ball-football',
  colorRamp: 'teal',
};

const basePost: Post = {
  id: 1,
  userId: 'user-marcus',
  userFullName: 'Marcus Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: 'Great 5-a-side session tonight, 3 wins in a row for the squad.',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  sportName: 'Soccer',
  visibility: 'public',
  media: [],
  hashtags: ['5aside', 'fridayrun'],
  previewComments: [],
  likeCount: 14,
  commentCount: 3,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
};

const meta = {
  title: 'HomeFeed/PostCard',
  component: PostCard,
  args: {
    onToggleLike: () => {},
    onHashtagClick: () => {},
    onDeletePost: () => {},
    onOpenComments: () => {},
    currentUserId: 'someone-else',
  },
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unliked: Story = {
  args: { post: basePost, sport: football },
};

export const Liked: Story = {
  args: { post: { ...basePost, isLikedByCurrentUser: true, likeCount: 15 }, sport: football },
};

export const WithAvatarImage: Story = {
  args: {
    post: { ...basePost, userAvatarUrl: 'https://i.pravatar.cc/72?img=12' },
    sport: football,
  },
};

export const NoSportBadge: Story = {
  args: { post: { ...basePost, sportId: null, sportName: null }, sport: null },
};

export const OwnPostShowsDeleteMenu: Story = {
  args: { post: basePost, sport: football, currentUserId: 'user-marcus' },
};

export const LongTextManyTags: Story = {
  args: {
    post: {
      ...basePost,
      content:
        'Post-season wrap-up: we played fourteen matches, won nine, drew three, and only dropped two — a huge step up from last year. Massive thanks to everyone who showed up to trainings in the rain and organized the logistics week after week.',
      hashtags: ['wrapup', 'season2026', '5aside', 'squadgoals', 'training', 'thanks'],
    },
    sport: football,
  },
};
