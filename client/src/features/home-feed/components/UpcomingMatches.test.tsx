import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { UpcomingMatch } from '../types';
import { UpcomingMatches } from './UpcomingMatches';

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

const makeMatch = (
  id: string,
  sport: SportKey,
  title: string,
  spotsLeft: number,
): UpcomingMatch => ({
  id,
  sport,
  title,
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  location: 'Central Turf Park',
  spotsLeft,
});

const matches = [
  makeMatch('match-1', 'football', 'Warriors vs Riverside', 2),
  makeMatch('match-2', 'basketball', 'Sunday pickup run', 4),
  makeMatch('match-3', 'tennis', 'Singles ladder match', 0),
];

const renderMatches = (
  overrides: Partial<React.ComponentProps<typeof UpcomingMatches>> = {},
) =>
  render(
    <UpcomingMatches
      matches={matches}
      activeSport="all"
      sportsByKey={sportsByKey}
      onSeeAll={() => {}}
      onSelectMatch={() => {}}
      {...overrides}
    />,
  );

// One CTA per visible match, so its count is the visible-row count
const getCtas = () => screen.getAllByRole('button', { name: /join|view details/ });

describe('UpcomingMatches', () => {
  it('shows all matches when activeSport is "all"', () => {
    renderMatches();
    expect(getCtas()).toHaveLength(3);
    expect(screen.getByText('Warriors vs Riverside')).toBeInTheDocument();
    expect(screen.getAllByText('Central Turf Park')).toHaveLength(3); // location row on every match
  });

  it('filters matches by the active sport', () => {
    renderMatches({ activeSport: 'football' });
    expect(getCtas()).toHaveLength(1);
    expect(screen.queryByText('Sunday pickup run')).not.toBeInTheDocument();
  });

  it('renders the empty state for a sport with no matches', () => {
    renderMatches({ matches: matches.filter((m) => m.sport !== 'tennis'), activeSport: 'tennis' });
    expect(screen.getByText('No upcoming matches for this sport.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /join|view details/ })).toHaveLength(0);
    // Header and "See all" survive the empty state (mockup parity)
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('labels open and full matches with distinct CTA text', () => {
    renderMatches();
    expect(screen.getByText('2 spots left, join')).toBeInTheDocument();
    expect(screen.getByText('Full, view details')).toBeInTheDocument();
  });

  it('reports the match id from both the open and the full CTA', async () => {
    const user = userEvent.setup();
    const onSelectMatch = vi.fn();
    renderMatches({ onSelectMatch });

    await user.click(screen.getByRole('button', { name: /Warriors vs Riverside/ }));
    expect(onSelectMatch).toHaveBeenCalledWith('match-1');

    await user.click(screen.getByRole('button', { name: /Singles ladder match/ }));
    expect(onSelectMatch).toHaveBeenCalledWith('match-3');
  });

  it('"See all" calls onSeeAll', async () => {
    const user = userEvent.setup();
    const onSeeAll = vi.fn();
    renderMatches({ onSeeAll });
    await user.click(screen.getByRole('button', { name: 'See all' }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  const six = Array.from({ length: 6 }, (_, i) =>
    makeMatch(`match-f${i}`, 'football', `Round ${i}`, 2),
  );

  it('caps visible matches at 4 by default', () => {
    renderMatches({ matches: six });
    expect(getCtas()).toHaveLength(4);
  });

  it('respects a custom maxVisible cap', () => {
    renderMatches({ matches: six, maxVisible: 2 });
    expect(getCtas()).toHaveLength(2);
  });
});
