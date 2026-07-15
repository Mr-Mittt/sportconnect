import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Post } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
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

function post(overrides: Partial<Post> & Pick<Post, 'id' | 'userFullName'>): Post {
  return {
    userId: 'someone-else',
    userAvatarUrl: null,
    postType: 'USER_FEED',
    groupId: null,
    content: `${overrides.userFullName}'s post`,
    latitude: null,
    longitude: null,
    locationName: null,
    sportId: null,
    sportName: null,
    visibility: 'public',
    media: [],
    hashtags: [],
    previewComments: [],
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    isLikedByCurrentUser: false,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    broadcastEndTime: null,
    ...overrides,
  };
}

const posts: Post[] = [
  post({
    id: 1,
    userFullName: 'Marcus Lee',
    sportId: 5,
    content: 'Great 5-a-side session tonight, 3 wins in a row for the squad.',
    hashtags: ['5aside', 'fridayrun'],
    likeCount: 14,
    commentCount: 3,
  }),
  post({
    id: 2,
    userFullName: 'Priya Shah',
    sportId: 6,
    content: 'Looking for 2 more players for Sunday pickup at Riverside courts.',
    hashtags: ['pickup', 'riverside'],
    likeCount: 9,
    commentCount: 6,
    isLikedByCurrentUser: true,
  }),
];

const meta = {
  title: 'Shared/Feed',
  component: Feed,
  args: {
    sportsByKey,
    currentUserId: 'someone-else',
    onToggleLike: () => {},
    onHashtagClick: () => {},
    onDeletePost: () => {},
    onOpenComments: () => {},
    onLoadMore: () => {},
    hasMorePosts: false,
    isFetchingMorePosts: false,
    isLoading: false,
    isError: false,
  },
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

export const HasMorePosts: Story = {
  args: { posts, activeSport: 'all', hasMorePosts: true },
};

export const LoadingNextPage: Story = {
  args: { posts, activeSport: 'all', hasMorePosts: true, isFetchingMorePosts: true },
};
