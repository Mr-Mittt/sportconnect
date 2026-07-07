import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { HomeFeedPage } from './HomeFeedPage';

// Mock data fixture facts (mockData.ts): 4 posts (2 football / 1 basketball /
// 1 tennis), 3 matches (1 per sport), 4 hashtags, 2 broadcasts.

const getMatchCtas = () => screen.getAllByRole('button', { name: /join|view details/ });
// #fridayrun exists both as a post hashtag and a trending row — scope to the rail cards
const trendingCard = () => within(screen.getByRole('region', { name: 'Trending hashtags' }));
const broadcastsCard = () => within(screen.getByRole('region', { name: 'Group broadcasts' }));

describe('HomeFeedPage', () => {
  it('renders switcher, feed, and all three rail cards from the hook', () => {
    render(<HomeFeedPage />);
    expect(screen.getByRole('group', { name: 'Sport filter' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(getMatchCtas()).toHaveLength(3);
    expect(trendingCard().getByText('#fridayrun')).toBeInTheDocument();
    expect(broadcastsCard().getByText('Riverside Ballers')).toBeInTheDocument();
  });

  it('sport selection filters feed and matches together; trending/broadcasts unaffected', async () => {
    const user = userEvent.setup();
    render(<HomeFeedPage />);

    await user.click(screen.getByRole('button', { name: 'Basketball' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(getMatchCtas()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sunday pickup run/ })).toBeInTheDocument();
    // Global cards unchanged (epic open question #1 resolution)
    expect(trendingCard().getByText('#fridayrun')).toBeInTheDocument();
    expect(broadcastsCard().getByText('Riverside Ballers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(getMatchCtas()).toHaveLength(3);
  });

  it('like toggle increments through the hook and reverts on second click', async () => {
    const user = userEvent.setup();
    render(<HomeFeedPage />);

    const likeButton = screen.getAllByRole('button', { name: 'Like' })[0];
    expect(likeButton).toHaveTextContent('14'); // Marcus Lee's post, first in mock order
    await user.click(likeButton);

    const unlikeButton = screen.getAllByRole('button', { name: 'Unlike' })[0];
    expect(unlikeButton).toHaveTextContent('15');
    expect(unlikeButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(unlikeButton);
    expect(screen.getAllByRole('button', { name: 'Like' })[0]).toHaveTextContent('14');
  });

  it('"Add sport" is at the 3-profile cap with mock data (aria-disabled, per HF-2)', () => {
    render(<HomeFeedPage />);
    expect(screen.getByRole('button', { name: 'Add sport' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
