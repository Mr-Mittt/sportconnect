import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Comment, Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { CommentSection } from './CommentSection';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
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

const football: SportProfile = { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' };

const meta = {
  title: 'Shared/CommentSection',
  component: CommentSection,
  args: {
    isOpen: true,
    onClose: () => {},
    currentUserId: 'user-marcus',
    currentUser: { fullName: 'Jordan Lee', avatarUrl: null },
    post,
    sport: football,
    isPostLoading: false,
    isPostError: false,
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
    onHashtagClick: () => {},
    onTogglePostLike: () => {},
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

/**
 * CLIENT-SESSION-51 — the system lines a host's edit of a `PREPARING` session writes (SESSION-67), one per changed
 * field, in the four shapes: added, updated, changed, removed. The stored `content` is only the fallback, so it differs
 * from what is shown on purpose. The last line has an unreadable value and shows the stored text.
 */
export const WithFieldChanges: Story = {
  args: {
    comments: [
      makeComment({ id: 10, content: 'Marcus Lee added the start time', systemCode: 'SESSION_START_CHANGED', systemParams: { name: 'Marcus Lee', old: '', new: new Date(2026, 10, 20, 18, 0).toISOString() } }),
      makeComment({ id: 11, content: 'Marcus Lee changed the fee', systemCode: 'SESSION_FEE_CHANGED', systemParams: { name: 'Marcus Lee', oldFeeType: 'FREE', oldFeeAmountVnd: '', newFeeType: 'FIXED', newFeeAmountVnd: '50000' } }),
      makeComment({ id: 12, content: 'Marcus Lee updated the fee note', systemCode: 'SESSION_FEE_NOTE_CHANGED', systemParams: { name: 'Marcus Lee', old: 'Cash', new: 'Bring cash, no change' } }),
      makeComment({ id: 13, content: 'Marcus Lee changed the location', systemCode: 'SESSION_LOCATION_CHANGED', systemParams: { name: 'Marcus Lee', old: 'Court A', new: 'Court B' } }),
      makeComment({ id: 14, content: 'Marcus Lee changed the duration', systemCode: 'SESSION_DURATION_CHANGED', systemParams: { name: 'Marcus Lee', old: '60', new: '90' } }),
      makeComment({ id: 15, content: 'Marcus Lee removed the male slots', systemCode: 'SESSION_MALE_SLOTS_CHANGED', systemParams: { name: 'Marcus Lee', old: '3', new: '' } }),
      makeComment({ id: 16, content: 'Marcus Lee updated the sport details', systemCode: 'SESSION_ATTRIBUTES_CHANGED', systemParams: { name: 'Marcus Lee' } }),
      makeComment({ id: 17, content: 'Marcus Lee changed the start time (stored text)', systemCode: 'SESSION_START_CHANGED', systemParams: { name: 'Marcus Lee', old: 'soon', new: 'later' } }),
    ].map((comment) => ({ ...comment, commentType: 'SESSION_SYSTEM' as const, likeCount: 0 })),
  },
};

export const NoSportBadge: Story = {
  args: { comments: [makeComment()], sport: null },
};

export const PostLiked: Story = {
  args: {
    post: { ...post, isLikedByCurrentUser: true, likeCount: 15 },
    comments: [makeComment()],
  },
};

export const WithHashtag: Story = {
  args: {
    post: { ...post, content: 'Great 5-a-side session tonight, 3 wins in a row! #fridayrun' },
    comments: [makeComment({ content: 'Count me in for #fridayrun' })],
  },
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

// FEED-12: usePost's own loading/error state — distinct from the comment
// thread's Loading/ErrorState stories above. Reachable on a cold /posts/:id
// load, before the post itself resolves.
export const PostLoading: Story = {
  args: { post: null, isPostLoading: true, comments: [] },
};

export const PostNotFound: Story = {
  args: { post: null, isPostError: true, comments: [] },
};
