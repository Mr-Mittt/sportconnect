import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/features/feed/types';
import { PostCard } from './PostCard';

// CLIENT-GL-50 part 2: a post with a tagged person and a line break, in the feed.

const PRIYA = '123e4567-e89b-12d3-a456-426614174000';

const post: Post = {
  id: 1,
  userId: 'user-marcus',
  userFullName: 'Marcus Lee',
  userAvatarUrl: null,
  postType: 'USER_FEED',
  groupId: null,
  content: `Game tonight with @[Priya Shah](${PRIYA}) #derby\nCourt 3 at 7pm`,
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

function renderCard(onHashtagClick = vi.fn()) {
  return render(
    <PostCard
      post={post}
      sport={null}
      currentUserId="someone-else"
      groupName={null}
      onToggleLike={() => {}}
      onHashtagClick={onHashtagClick}
      onDeletePost={() => {}}
      onOpenComments={() => {}}
    />,
  );
}

describe('PostCard tags and line breaks', () => {
  it('draws the tagged person as a chip with the stored name, never the id or the markup', () => {
    const { container } = renderCard();
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toHaveTextContent('@Priya Shah');
    expect(container).not.toHaveTextContent(PRIYA);
    expect(container).not.toHaveTextContent('@[');
  });

  it('keeps the hashtag clickable next to the chip', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    renderCard(onHashtagClick);
    await user.click(screen.getByRole('button', { name: '#derby' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#derby');
  });

  it('shows the line break of the post', () => {
    const { container } = renderCard();
    const body = container.querySelector('article p');
    expect(body).toHaveClass('whitespace-pre-line');
    expect(body?.textContent).toContain('\nCourt 3 at 7pm');
  });
});
