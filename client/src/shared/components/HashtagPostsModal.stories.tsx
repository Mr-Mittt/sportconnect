import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Post } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { HashtagPostsModal } from './HashtagPostsModal';

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
    content: 'Great 5-a-side session tonight! #fridayrun',
    hashtags: ['fridayrun'],
    likeCount: 14,
    commentCount: 3,
  }),
  post({
    id: 2,
    userFullName: 'Priya Shah',
    sportId: 6,
    content: "Who's in for Friday? #fridayrun",
    hashtags: ['fridayrun'],
    likeCount: 9,
    commentCount: 0,
  }),
];

const meta = {
  title: 'Shared/HashtagPostsModal',
  component: HashtagPostsModal,
  args: {
    isOpen: true,
    onClose: () => {},
    tag: '#fridayrun',
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
    onRetry: () => {},
    isLoadMoreError: false,
  },
} satisfies Meta<typeof HashtagPostsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: { posts },
};

export const WithMoreToLoad: Story = {
  args: { posts, hasMorePosts: true },
};

export const Empty: Story = {
  args: { posts: [] },
};

export const Loading: Story = {
  args: { posts: [], isLoading: true },
};

export const ErrorState: Story = {
  args: { posts: [], isError: true },
};
