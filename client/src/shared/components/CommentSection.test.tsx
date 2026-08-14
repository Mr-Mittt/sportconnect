import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment, Post } from '@/features/feed/types';
import type { SportProfile } from '@/shared/types/sport';
import { CommentSection } from './CommentSection';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'Great session!',
    parentCommentId: null,
    likeCount: 2,
    replyCount: 0,
    isLikedByCurrentUser: false,
    replies: [],
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
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
  content: 'Great 5-a-side session tonight!',
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  visibility: 'public',
  media: [],
  hashtags: [],
  previewComments: [],
  likeCount: 2,
  commentCount: 1,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
};

const football: SportProfile = { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' };

const currentUser = { fullName: 'Jordan Lee', avatarUrl: null };
const noop = () => {};
const baseProps = {
  isOpen: true,
  onClose: noop,
  currentUserId: 'user-marcus',
  currentUser,
  post,
  sport: football,
  isPostLoading: false,
  isPostError: false,
  comments: [] as Comment[],
  isLoading: false,
  isError: false,
  hasMore: false,
  isFetchingMore: false,
  onFetchMore: noop,
  onAddComment: noop,
  onAddReply: noop,
  isPosting: false,
  onDeleteComment: noop,
  onToggleCommentLike: noop,
  onHashtagClick: noop,
  onTogglePostLike: noop,
};

describe('CommentSection', () => {
  it('renders the post header (author, relative time, sport badge) and repeats the post content in the body', () => {
    render(<CommentSection {...baseProps} />);
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
    expect(screen.getByText('Football')).toBeInTheDocument();
    expect(screen.getByText('Great 5-a-side session tonight!')).toBeInTheDocument();
  });

  it('renders no sport badge when sport is null, and nothing post-related when post is null', () => {
    const { rerender } = render(<CommentSection {...baseProps} sport={null} />);
    expect(screen.queryByText('Football')).not.toBeInTheDocument();
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();

    rerender(<CommentSection {...baseProps} post={null} sport={null} />);
    expect(screen.queryByText('Marcus Lee')).not.toBeInTheDocument();
    expect(screen.queryByText('Great 5-a-side session tonight!')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder header while the post itself is loading (post null, isPostLoading)', () => {
    render(<CommentSection {...baseProps} post={null} isPostLoading />);
    expect(screen.queryByText('Marcus Lee')).not.toBeInTheDocument();
    // Close is still reachable even though the real header hasn't rendered.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it("shows a couldn't-load message when the post itself failed (post null, isPostError)", () => {
    render(<CommentSection {...baseProps} post={null} isPostError />);
    expect(screen.getByText("Couldn't load this post.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders comments, including nested replies', () => {
    render(
      <CommentSection
        {...baseProps}
        comments={[
          makeComment({
            replies: [
              makeComment({ id: 2, userFullName: 'Priya Shah', content: 'Agreed!', parentCommentId: 1 }),
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Agreed!')).toBeInTheDocument();
  });

  it('shows the empty state for a thread with zero comments', () => {
    render(<CommentSection {...baseProps} comments={[]} />);
    expect(screen.getByText('No comments yet. Be the first to comment!')).toBeInTheDocument();
  });

  it('shows a loading state while isLoading', () => {
    render(<CommentSection {...baseProps} isLoading comments={[]} />);
    expect(screen.getByText('Loading comments…')).toBeInTheDocument();
    expect(screen.queryByText('No comments yet. Be the first to comment!')).not.toBeInTheDocument();
  });

  it('shows an error message when isError', () => {
    render(<CommentSection {...baseProps} isError comments={[]} />);
    expect(screen.getByText("Couldn't load comments.")).toBeInTheDocument();
  });

  it('shows "View more comments" when hasMore, calling onFetchMore on click', async () => {
    const user = userEvent.setup();
    const onFetchMore = vi.fn();
    render(
      <CommentSection {...baseProps} comments={[makeComment()]} hasMore onFetchMore={onFetchMore} />,
    );
    await user.click(screen.getByRole('button', { name: 'View more comments' }));
    expect(onFetchMore).toHaveBeenCalledTimes(1);
  });

  it('submits a new comment via the bottom composer and clears it', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(<CommentSection {...baseProps} onAddComment={onAddComment} />);
    const input = screen.getByRole('textbox', { name: 'Add a comment' });
    await user.type(input, 'Nice one!');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(onAddComment).toHaveBeenCalledWith('Nice one!');
    expect(input).toHaveValue('');
  });

  it('send button stays disabled (muted) while the composer is empty, solid once there is text', async () => {
    const user = userEvent.setup();
    render(<CommentSection {...baseProps} />);
    const postBtn = screen.getByRole('button', { name: 'Post comment' });
    expect(postBtn).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'x');
    expect(postBtn).not.toBeDisabled();
  });

  it('reply/delete/like on a comment call through to their handlers', async () => {
    const user = userEvent.setup();
    const onToggleCommentLike = vi.fn();
    const onDeleteComment = vi.fn();
    const comment = makeComment();
    render(
      <CommentSection
        {...baseProps}
        comments={[comment]}
        onToggleCommentLike={onToggleCommentLike}
        onDeleteComment={onDeleteComment}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Like comment' }));
    expect(onToggleCommentLike).toHaveBeenCalledWith(comment);

    await user.click(screen.getByRole('button', { name: 'Comment options' }));
    await user.click(await screen.findByText('Delete'));
    expect(onDeleteComment).toHaveBeenCalledWith(comment);
  });

  it('closing the dialog calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommentSection {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a like button for the post itself, reflecting props and reporting the post id on click', async () => {
    const user = userEvent.setup();
    const onTogglePostLike = vi.fn();
    const { rerender } = render(
      <CommentSection {...baseProps} onTogglePostLike={onTogglePostLike} />,
    );

    const likeButton = screen.getByRole('button', { name: 'Like' });
    expect(likeButton).toHaveTextContent('2');
    await user.click(likeButton);
    expect(onTogglePostLike).toHaveBeenCalledWith(1);

    // Controlled: rendering follows props, same convention as PostCard.
    rerender(
      <CommentSection
        {...baseProps}
        post={{ ...post, isLikedByCurrentUser: true, likeCount: 3 }}
        onTogglePostLike={onTogglePostLike}
      />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('3');
  });

  it('renders no post like button when post is null', () => {
    render(<CommentSection {...baseProps} post={null} />);
    expect(screen.queryByRole('button', { name: /^(Like|Unlike)$/ })).not.toBeInTheDocument();
  });

  it('renders a hashtag inline within the repeated post content as a clickable button', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <CommentSection
        {...baseProps}
        post={{ ...post, content: 'Great 5-a-side session tonight! #fridayrun' }}
        onHashtagClick={onHashtagClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('renders a hashtag inside a comment as a clickable button too', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <CommentSection
        {...baseProps}
        comments={[makeComment({ content: 'Count me in for #fridayrun' })]}
        onHashtagClick={onHashtagClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });
});
