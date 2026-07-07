import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Post } from '../types';
import { Feed } from './Feed';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: {
    key: 'basketball',
    label: 'Basketball',
    icon: 'ball-basketball',
    colorRamp: 'coral',
  },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const makePost = (id: string, sport: SportKey, authorName: string): Post => ({
  id,
  sport,
  authorName,
  authorInitials: 'XX',
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  text: `${authorName}'s post`,
  hashtags: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
});

const posts = [
  makePost('post-1', 'football', 'Marcus'),
  makePost('post-2', 'basketball', 'Priya'),
  makePost('post-3', 'football', 'Hana'),
];

describe('Feed', () => {
  it('shows all posts when activeSport is "all"', () => {
    render(
      <Feed
        posts={posts}
        activeSport="all"
        sportsByKey={sportsByKey}
        onToggleLike={() => {}}
        onHashtagClick={() => {}}
      />,
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('filters posts by the active sport', () => {
    render(
      <Feed
        posts={posts}
        activeSport="football"
        sportsByKey={sportsByKey}
        onToggleLike={() => {}}
        onHashtagClick={() => {}}
      />,
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText("Priya's post")).not.toBeInTheDocument();
  });

  it('renders the empty state for a sport with zero posts', () => {
    render(
      <Feed
        posts={posts}
        activeSport="tennis"
        sportsByKey={sportsByKey}
        onToggleLike={() => {}}
        onHashtagClick={() => {}}
      />,
    );
    expect(screen.getByText('No posts yet for this sport.')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });
});
