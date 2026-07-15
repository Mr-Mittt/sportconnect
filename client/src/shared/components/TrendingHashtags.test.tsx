import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TrendingHashtag } from '@/shared/types/rail';
import { TrendingHashtags } from './TrendingHashtags';

const hashtags: TrendingHashtag[] = [
  { tag: '#fridayrun', postCount: 128 },
  { tag: '#tournament', postCount: 94 },
  { tag: '#pickup', postCount: 61 },
];

describe('TrendingHashtags', () => {
  it('renders one row per hashtag with tag and post count', () => {
    render(<TrendingHashtags hashtags={hashtags} onHashtagClick={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('#fridayrun')).toBeInTheDocument();
    expect(screen.getByText('128 posts')).toBeInTheDocument();
  });

  it('preserves the caller-provided order (no re-sorting)', () => {
    // Deliberately not sorted by postCount — the component must not "fix" it
    const unsorted = [hashtags[2], hashtags[0], hashtags[1]];
    render(<TrendingHashtags hashtags={unsorted} onHashtagClick={() => {}} />);
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows).toEqual(['#pickup61 posts', '#fridayrun128 posts', '#tournament94 posts']);
  });

  it('reports the clicked tag with its # prefix', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(<TrendingHashtags hashtags={hashtags} onHashtagClick={onHashtagClick} />);
    await user.click(screen.getByRole('button', { name: /#tournament/ }));
    expect(onHashtagClick).toHaveBeenCalledWith('#tournament');
  });

  it('renders the empty state with the header intact', () => {
    render(<TrendingHashtags hashtags={[]} onHashtagClick={() => {}} />);
    expect(screen.getByText('Nothing trending right now.')).toBeInTheDocument();
    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
