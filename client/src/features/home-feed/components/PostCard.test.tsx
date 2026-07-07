import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportProfile } from '@/shared/types/sport';
import type { Post } from '../types';
import { PostCard } from './PostCard';

const football: SportProfile = {
  key: 'football',
  label: 'Football',
  icon: 'ball-football',
  colorRamp: 'teal',
};

const post: Post = {
  id: 'post-1',
  sport: 'football',
  authorName: 'Marcus Lee',
  authorInitials: 'ML',
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  text: 'Great 5-a-side session tonight.',
  hashtags: ['#5aside', '#fridayrun'],
  likeCount: 14,
  commentCount: 3,
  likedByMe: false,
};

describe('PostCard', () => {
  it('renders author, computed relative time, sport badge, and body', () => {
    render(
      <PostCard post={post} sport={football} onToggleLike={() => {}} onHashtagClick={() => {}} />,
    );
    expect(screen.getByText('Marcus Lee')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument(); // computed from createdAt, not stored
    expect(screen.getByText('Football')).toBeInTheDocument();
    expect(screen.getByText('Great 5-a-side session tonight.')).toBeInTheDocument();
    expect(screen.getByText('ML')).toBeInTheDocument(); // initials fallback (no avatarUrl)
  });

  it('like button reports the post id and reflects the liked state from props', async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const { rerender } = render(
      <PostCard post={post} sport={football} onToggleLike={onToggleLike} onHashtagClick={() => {}} />,
    );

    const likeButton = screen.getByRole('button', { name: 'Like' });
    expect(likeButton).toHaveAttribute('aria-pressed', 'false');
    expect(likeButton).toHaveTextContent('14');
    await user.click(likeButton);
    expect(onToggleLike).toHaveBeenCalledWith('post-1');

    // Controlled: the liked rendering follows props (parent owns the state)
    rerender(
      <PostCard
        post={{ ...post, likedByMe: true, likeCount: 15 }}
        sport={football}
        onToggleLike={onToggleLike}
        onHashtagClick={() => {}}
      />,
    );
    const unlikeButton = screen.getByRole('button', { name: 'Unlike' });
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');
    expect(unlikeButton).toHaveTextContent('15');
  });

  it('hashtags are clickable and report their tag', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <PostCard post={post} sport={football} onToggleLike={() => {}} onHashtagClick={onHashtagClick} />,
    );
    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('comment count is display-only (not a button)', () => {
    render(
      <PostCard post={post} sport={football} onToggleLike={() => {}} onHashtagClick={() => {}} />,
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).not.toContain('3');
  });
});
