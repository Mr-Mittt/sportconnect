import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment } from '@/features/feed/types';
import { CommentItem } from './CommentItem';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const baseComment: Comment = {
  id: 1,
  postId: 1,
  commentType: 'USER',
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
  title: 'Shared/CommentItem',
  component: CommentItem,
  args: {
    onToggleLike: () => {},
    onDelete: () => {},
    onReply: () => {},
    isSubmittingReply: false,
    currentUserId: 'someone-else',
    onHashtagClick: () => {},
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

/** The "..." options menu (Edit — disabled, no backend endpoint yet — + Delete) only renders for
 * the caller's own comment. */
export const OwnCommentShowsOptionsMenu: Story = {
  args: { comment: baseComment, currentUserId: 'user-marcus' },
};

export const WithHashtag: Story = {
  args: { comment: { ...baseComment, content: 'Same time next week? #fridayrun' } },
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

/**
 * CLIENT-SESSION-13 — a `SESSION_SYSTEM` entry (SESSION-21 writes these when a participant
 * joins/leaves or the session starts). Renders as a centered, avatar-less thread event with no
 * like, reply, or options control, because the server rejects all three on a system entry.
 * `content` is server-templated and shown verbatim.
 */
export const SystemComment: Story = {
  args: {
    comment: {
      ...baseComment,
      id: 10,
      commentType: 'SESSION_SYSTEM',
      content: 'Priya Shah joined the session',
      likeCount: 0,
      replies: [],
    },
  },
};

/**
 * The same entry viewed by its *nominal* author — SESSION-21 authors system entries as the
 * session creator, so this is the case where a naive `isOwnComment` check would wrongly offer a
 * Delete the API refuses. Should look identical to `SystemComment`.
 */
export const SystemCommentAsAuthor: Story = {
  args: {
    comment: {
      ...baseComment,
      id: 11,
      commentType: 'SESSION_SYSTEM',
      content: 'The session has started',
      likeCount: 0,
      replies: [],
    },
    currentUserId: baseComment.userId,
  },
};
