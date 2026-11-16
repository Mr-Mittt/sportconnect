import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Comment } from '@/features/feed/types';
import { CommentItem } from './CommentItem';
import type { MentionSource } from './MentionInput';

// CLIENT-GL-50: a session comment draws its tags as chips and its reply box is a chip composer; a Post comment is untouched.

const ID = '123e4567-e89b-12d3-a456-426614174000';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    postId: 1,
    commentType: 'USER',
    userId: 'user-marcus',
    userFullName: 'Marcus Lee',
    userAvatarUrl: null,
    content: `Nice one @[Priya Shah](${ID})`,
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

const noop = () => {};
const source: MentionSource = {
  options: [{ id: ID, name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null }],
  onQueryChange: noop,
};

function renderItem(props: { mentionSource?: MentionSource; onReply?: (id: number, content: string) => void }) {
  render(
    <CommentItem
      comment={makeComment()}
      currentUserId="someone-else"
      onToggleLike={noop}
      onDelete={noop}
      onReply={props.onReply ?? noop}
      isSubmittingReply={false}
      mentionSource={props.mentionSource}
    />,
  );
}

describe('CommentItem tags', () => {
  it('draws the tags of a session comment as chips', () => {
    renderItem({ mentionSource: source });
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ID);
  });

  it('draws the tags of a reply as chips too', () => {
    render(
      <CommentItem
        comment={makeComment({
          replyCount: 1,
          replies: [makeComment({ id: 2, parentCommentId: 1, content: `thanks @[Priya Shah](${ID})` })],
        })}
        currentUserId="someone-else"
        onToggleLike={noop}
        onDelete={noop}
        onReply={noop}
        isSubmittingReply={false}
        mentionSource={source}
      />,
    );
    expect(screen.getAllByRole('img', { name: 'Mention: Priya Shah' })).toHaveLength(2);
  });

  it('does not talk to the shared source while its reply box is closed (the composer owns the query then)', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderItem({ mentionSource: { ...source, onQueryChange } });
    expect(onQueryChange).not.toHaveBeenCalled();
    // Opening the box reports its own word; closing it hands the source back.
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: 'Reply to Marcus Lee' }), '@Pr');
    expect(onQueryChange).toHaveBeenLastCalledWith('Pr');
  });

  it('leaves a Post comment (no source) exactly as stored', () => {
    renderItem({});
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(`Nice one @[Priya Shah](${ID})`)).toBeInTheDocument();
  });

  it('lets a reply tag someone and sends the id markup', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    renderItem({ mentionSource: source, onReply });
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    const box = screen.getByRole('textbox', { name: 'Reply to Marcus Lee' });
    await user.type(box, 'thanks @Pr');
    expect(screen.getByRole('listbox', { name: 'People you can tag' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(onReply).toHaveBeenCalledWith(1, `thanks @[Priya Shah](${ID})`);
  });

  it('keeps the plain reply box for a Post comment', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    renderItem({ onReply });
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByRole('textbox', { name: 'Reply to Marcus Lee' }), 'ok @Pr{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onReply).toHaveBeenCalledWith(1, 'ok @Pr');
  });
});
