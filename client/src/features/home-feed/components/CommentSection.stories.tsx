import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment, Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { CommentSection } from './CommentSection';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'Great 5-a-side session tonight!',
    parentCommentId: null,
    likeCount: 2,
    replyCount: 0,
    isLikedByCurrentUser: false,
    replies: [],
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...overrides,
  };
}

const post: Post = {
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
  hashtags: [],
  previewComments: [],
  likeCount: 14,
  commentCount: 2,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: hoursAgo(2),
  updatedAt: hoursAgo(2),
  broadcastEndTime: null,
};

const football: SportProfile = { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' };

const meta = {
  title: 'HomeFeed/CommentSection',
  component: CommentSection,
  args: {
    isOpen: true,
    onClose: () => {},
    currentUserId: 'user-marcus',
    currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
    post,
    sport: football,
    comments: [],
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    onFetchMore: () => {},
    onAddComment: () => {},
    onAddReply: () => {},
    isPosting: false,
    onDeleteComment: () => {},
    onToggleCommentLike: () => {},
  },
} satisfies Meta<typeof CommentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithComments: Story = {
  args: {
    comments: [
      makeComment({
        replies: [
          makeComment({
            id: 2,
            userFullName: 'Priya Shah',
            content: 'Same time next week?',
            parentCommentId: 1,
            likeCount: 0,
          }),
        ],
      }),
      makeComment({ id: 3, userFullName: 'Diego Alvarez', content: 'Great turnout!', likeCount: 5 }),
    ],
  },
};

export const NoSportBadge: Story = {
  args: { comments: [makeComment()], sport: null },
};

export const Empty: Story = {
  args: { comments: [] },
};

export const Loading: Story = {
  args: { comments: [], isLoading: true },
};

export const ErrorState: Story = {
  args: { comments: [], isError: true },
};

export const WithMoreToLoad: Story = {
  args: { comments: [makeComment()], hasMore: true },
};
