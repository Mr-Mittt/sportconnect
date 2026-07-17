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
  content: 'Great 5-a-side session tonight, 3 wins in a row for the squad. #5aside #fridayrun',
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
  title: 'Shared/PostCard',
  component: PostCard,
  args: {
    onToggleLike: () => {},
    onHashtagClick: () => {},
    onDeletePost: () => {},
    onOpenComments: () => {},
    currentUserId: 'someone-else',
    groupName: null,
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

export const GroupBroadcast: Story = {
  args: {
    post: { ...basePost, postType: 'GROUP_BROADCAST', groupId: 1, content: 'Court booking confirmed for Sunday 9am, see you there!' },
    sport: football,
  },
};

// Home Feed / Groups page "All" view — disambiguates which group a
// GROUP_POST/GROUP_BROADCAST belongs to since posts from many groups blend
// together there (unlike a specific group's own feed, which passes null).
export const WithGroupName: Story = {
  args: {
    post: { ...basePost, postType: 'GROUP_POST', groupId: 1 },
    sport: football,
    groupName: '1st Football',
  },
};

export const LongTextManyTags: Story = {
  args: {
    post: {
      ...basePost,
      content:
        'Post-season wrap-up: we played fourteen matches, won nine, drew three, and only dropped two — a huge step up from last year. #wrapup #season2026 #5aside #squadgoals Massive thanks to everyone who showed up to trainings in the rain and organized the logistics week after week. #training #thanks',
      hashtags: ['wrapup', 'season2026', '5aside', 'squadgoals', 'training', 'thanks'],
    },
    sport: football,
  },
};
