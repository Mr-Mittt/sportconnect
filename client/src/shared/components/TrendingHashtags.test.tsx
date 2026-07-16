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

function renderHashtags(overrides: Partial<React.ComponentProps<typeof TrendingHashtags>> = {}) {
  return render(
    <TrendingHashtags
      hashtags={hashtags}
      onHashtagClick={() => {}}
      isLoading={false}
      isError={false}
      onRetry={() => {}}
      {...overrides}
    />,
  );
}

describe('TrendingHashtags', () => {
  it('renders one row per hashtag with tag and post count', () => {
    renderHashtags();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('#fridayrun')).toBeInTheDocument();
    expect(screen.getByText('128 posts')).toBeInTheDocument();
  });

  it('preserves the caller-provided order (no re-sorting)', () => {
    // Deliberately not sorted by postCount — the component must not "fix" it
    const unsorted = [hashtags[2], hashtags[0], hashtags[1]];
    renderHashtags({ hashtags: unsorted });
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows).toEqual(['#pickup61 posts', '#fridayrun128 posts', '#tournament94 posts']);
  });

  it('reports the clicked tag with its # prefix', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    renderHashtags({ onHashtagClick });
    await user.click(screen.getByRole('button', { name: /#tournament/ }));
    expect(onHashtagClick).toHaveBeenCalledWith('#tournament');
  });

  it('renders the empty state with the header intact', () => {
    renderHashtags({ hashtags: [] });
    expect(screen.getByText('Nothing trending right now.')).toBeInTheDocument();
    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders a loading skeleton instead of rows or the empty state', () => {
    renderHashtags({ hashtags: [], isLoading: true });
    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.queryByText('Nothing trending right now.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders an error state with a retry action instead of rows or the empty state', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderHashtags({ hashtags: [], isError: true, onRetry });
    expect(screen.getByText("Couldn't load trending hashtags.")).toBeInTheDocument();
    expect(screen.queryByText('Nothing trending right now.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
