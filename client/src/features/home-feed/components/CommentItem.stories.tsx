import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment } from '@/features/feed/types';
import { CommentItem } from './CommentItem';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const baseComment: Comment = {
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
};

const meta = {
  title: 'HomeFeed/CommentItem',
  component: CommentItem,
  args: {
    onToggleLike: () => {},
    onDelete: () => {},
    onReply: () => {},
    isSubmittingReply: false,
    currentUserId: 'someone-else',
  },
} satisfies Meta<typeof CommentItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RootComment: Story = {
  args: { comment: baseComment },
};

export const Liked: Story = {
  args: { comment: { ...baseComment, isLikedByCurrentUser: true, likeCount: 3 } },
};

export const WithAvatarImage: Story = {
  args: { comment: { ...baseComment, userAvatarUrl: 'https://i.pravatar.cc/56?img=12' } },
};

export const OwnCommentShowsDelete: Story = {
  args: { comment: baseComment, currentUserId: 'user-marcus' },
};

export const ReplyRow: Story = {
  args: {
    comment: {
      ...baseComment,
      id: 2,
      userFullName: 'Priya Shah',
      content: 'Same time next week?',
      parentCommentId: 1,
    },
  },
};

export const WithNestedReplies: Story = {
  args: {
    comment: {
      ...baseComment,
      replies: [
        {
          ...baseComment,
          id: 2,
          userFullName: 'Priya Shah',
          content: 'Same time next week?',
          parentCommentId: 1,
          likeCount: 0,
        },
        {
          ...baseComment,
          id: 3,
          userFullName: 'Diego Alvarez',
          content: 'Count me in.',
          parentCommentId: 1,
          likeCount: 1,
        },
      ],
    },
  },
};
