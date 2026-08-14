import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment } from '@/features/feed/types';
import { SessionCommentSection } from './SessionCommentSection';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'What time are we meeting at the courts?',
    parentCommentId: null,
    likeCount: 1,
    replyCount: 0,
    isLikedByCurrentUser: false,
    replies: [],
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...overrides,
  };
}

const meta = {
  title: 'Session/SessionCommentSection',
  component: SessionCommentSection,
  args: {
    currentUserId: 'user-marcus',
    comments: [],
    isLoading: false,
    isError: false,
    isForbidden: false,
    hasMore: false,
    isFetchingMore: false,
    onFetchMore: () => {},
    onAddReply: () => {},
    isPosting: false,
    onDeleteComment: () => {},
    onToggleCommentLike: () => {},
  },
} satisfies Meta<typeof SessionCommentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { comments: [] },
};

export const WithComments: Story = {
  args: {
    comments: [
      makeComment({
        replies: [
          makeComment({
            id: 2,
            userFullName: 'Priya Shah',
            content: '7pm works for me',
            parentCommentId: 1,
            likeCount: 0,
          }),
        ],
      }),
      makeComment({ id: 3, userFullName: 'Diego Alvarez', content: "I'll bring the ball", likeCount: 3 }),
    ],
  },
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

/** CLIENT-SESSION-8's visibility gate — a 403 on the comments fetch renders nothing at all. */
export const Forbidden: Story = {
  args: { comments: [], isForbidden: true },
};
