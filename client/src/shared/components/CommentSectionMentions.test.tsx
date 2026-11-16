import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment, Post } from '@/features/feed/types';
import { CommentSection } from './CommentSection';
import type { MentionSource } from './MentionInput';

// CLIENT-GL-50 part 2: tagging in the comments of a post: the comment box, the reply box, the chips in the post body
// and in the comments, hashtags kept clickable next to them.

const PRIYA = '123e4567-e89b-12d3-a456-426614174000';

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    commentType: 'USER',
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: 'Great session!',
    parentCommentId: null,
    likeCount: 0,
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
  content: `Tonight with @[Priya Shah](${PRIYA}) #derby`,
  latitude: null,
  longitude: null,
  locationName: null,
  sportId: 5,
  visibility: 'public',
  media: [],
  hashtags: ['derby'],
  previewComments: [],
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  isLikedByCurrentUser: false,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  broadcastEndTime: null,
};

const noop = () => {};

function source(): MentionSource {
  return {
    options: [{ id: PRIYA, name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null }],
    onQueryChange: vi.fn(),
  };
}

function renderSection(props: Partial<React.ComponentProps<typeof CommentSection>> = {}) {
  return render(
    <CommentSection
      isOpen
      onClose={noop}
      currentUserId="user-me"
      currentUser={{ fullName: 'Jordan Lee', avatarUrl: null }}
      post={post}
      sport={null}
      isPostLoading={false}
      isPostError={false}
      comments={[]}
      isLoading={false}
      isError={false}
      hasMore={false}
      isFetchingMore={false}
      onFetchMore={noop}
      onAddComment={noop}
      onAddReply={noop}
      isPosting={false}
      onDeleteComment={noop}
      onToggleCommentLike={noop}
      onHashtagClick={noop}
      onTogglePostLike={noop}
      {...props}
    />,
  );
}

describe('CommentSection tagging', () => {
  it('draws the post body with its chip and a clickable hashtag', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    renderSection({ onHashtagClick });
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toBeInTheDocument();
    expect(screen.queryByText(/@\[Priya Shah\]/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '#derby' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#derby');
  });

  it('draws a stored tag in a comment as a chip, keeping the comment hashtag clickable', () => {
    renderSection({ comments: [comment({ content: `thanks @[Priya Shah](${PRIYA}) #derby` })] });
    expect(screen.getAllByRole('img', { name: 'Mention: Priya Shah' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '#derby' })).toHaveLength(2);
  });

  it('offers the source people for an @ word in the comment box, tells the source, and sends the tag as markup', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    const mentionSource = source();
    renderSection({ onAddComment, mentionSource });
    const box = screen.getByRole('textbox', { name: 'Add a comment' });
    await user.type(box, 'see @Pr');
    expect(mentionSource.onQueryChange).toHaveBeenLastCalledWith('Pr');
    const list = screen.getByRole('listbox', { name: 'People you can tag' });
    await user.click(within(list).getByRole('option', { name: /Priya Shah/ }));
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(onAddComment).toHaveBeenCalledWith(`see @[Priya Shah](${PRIYA})`);
    expect(box).toHaveTextContent('');
  });

  it('Enter sends the comment when the list is closed, and picks when it is open', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    renderSection({ onAddComment, mentionSource: source() });
    const box = screen.getByRole('textbox', { name: 'Add a comment' });
    await user.type(box, '@Pr');
    await user.keyboard('{Enter}');
    expect(onAddComment).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onAddComment).toHaveBeenCalledWith(`@[Priya Shah](${PRIYA})`);
  });

  it('a reply can tag someone too, and sends the markup with its parent id', async () => {
    const user = userEvent.setup();
    const onAddReply = vi.fn();
    renderSection({ comments: [comment()], onAddReply, mentionSource: source() });
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    const box = screen.getByRole('textbox', { name: 'Reply to Marcus Lee' });
    await user.type(box, 'ok @Pr');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(onAddReply).toHaveBeenCalledWith(1, `ok @[Priya Shah](${PRIYA})`);
  });

  it('without a source nobody is offered and the text is sent as typed', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    renderSection({ onAddComment });
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'hi @Pr');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Enter}');
    expect(onAddComment).toHaveBeenCalledWith('hi @Pr');
  });
});
