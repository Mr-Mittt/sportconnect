import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { Session, SessionStatus } from '@/shared/types/session';
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

const SPORT_ID: Record<SportKey, number> = { football: 5, basketball: 6, tennis: 2 };

function makeLocation(name: string): Location {
  return {
    id: 1,
    sportId: 5,
    sportName: 'Football',
    name,
    address: null,
    latitude: null,
    longitude: null,
    sourceMapsUrl: null,
    claimedByVendorId: null,
    createdBy: 'user-1',
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
  };
}

const makeMatch = (
  id: number,
  sport: SportKey,
  title: string,
  status: SessionStatus = 'SCHEDULED',
): Session => ({
  groupId: null,
  sessionType: 'STANDALONE',
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  sportId: SPORT_ID[sport],
  sportName: sport,
  title,
  description: null,
  location: makeLocation('Central Turf Park'),
  locationNote: null,
  scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  scheduledEndAt: null,
  status,
  cancelReason: null,
  cancelledBy: null,
  cancelledByFullName: null,
  cancelledAt: null,
  participantCount: 1,
  capacity: 10,
  feeType: 'FREE',
  feeAmountVnd: null,
  initialSlot: 0,
  autoApprove: false,
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
  id,
});

const matches = [
  makeMatch(1, 'football', 'Warriors vs Riverside'),
  makeMatch(2, 'basketball', 'Sunday pickup run', 'ONGOING'),
  makeMatch(3, 'tennis', 'Singles ladder match', 'CANCELLED'),
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
      onCreateMatch={() => {}}
      onJoinMatch={() => {}}
      {...overrides}
    />,
  );

const getCtas = () => screen.getAllByRole('button', { name: /View details/ });

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
    renderMatches({ matches: matches.filter((m) => m.sportId !== SPORT_ID.tennis), activeSport: 'tennis' });
    expect(screen.getByText('No upcoming matches.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /View details/ })).toHaveLength(0);
    // Header and "See all" survive the empty state (mockup parity)
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('renders "Create a match"/"Join a match" only in the empty state, wired to their own callbacks', async () => {
    const user = userEvent.setup();
    const onCreateMatch = vi.fn();
    const onJoinMatch = vi.fn();

    // Populated list — neither CTA renders.
    renderMatches({ onCreateMatch, onJoinMatch });
    expect(screen.queryByRole('button', { name: 'Create a match' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join a match' })).not.toBeInTheDocument();

    // Empty state — both render and call their own prop.
    renderMatches({
      matches: matches.filter((m) => m.sportId !== SPORT_ID.tennis),
      activeSport: 'tennis',
      onCreateMatch,
      onJoinMatch,
    });
    await user.click(screen.getByRole('button', { name: 'Create a match' }));
    expect(onCreateMatch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Join a match' }));
    expect(onJoinMatch).toHaveBeenCalledTimes(1);
  });

  it('shows a distinct status label per session status', () => {
    renderMatches();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('reports the session id from the "View details" CTA', async () => {
    const user = userEvent.setup();
    const onSelectMatch = vi.fn();
    renderMatches({ onSelectMatch });

    await user.click(screen.getByRole('button', { name: /Warriors vs Riverside/ }));
    expect(onSelectMatch).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: /Singles ladder match/ }));
    expect(onSelectMatch).toHaveBeenCalledWith(3);
  });

  it('"See all" calls onSeeAll', async () => {
    const user = userEvent.setup();
    const onSeeAll = vi.fn();
    renderMatches({ onSeeAll });
    await user.click(screen.getByRole('button', { name: 'See all' }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  const six = Array.from({ length: 6 }, (_, i) => makeMatch(100 + i, 'football', `Round ${i}`));

  it('caps visible matches at 4 by default', () => {
    renderMatches({ matches: six });
    expect(getCtas()).toHaveLength(4);
  });

  it('respects a custom maxVisible cap', () => {
    renderMatches({ matches: six, maxVisible: 2 });
    expect(getCtas()).toHaveLength(2);
  });

  // SPORT-1: sportsByKey is real now, so a match's sport isn't guaranteed to
  // have a resolved profile the way the old always-3-sport mock guaranteed —
  // same "render without a badge, not crash" fallback PostCard already uses.
  it('renders without a sport badge, not crashing, when sportsByKey has no entry for the match', () => {
    renderMatches({ sportsByKey: {} as Record<SportKey, SportProfile> });
    expect(getCtas()).toHaveLength(3);
    expect(screen.getByText('Warriors vs Riverside')).toBeInTheDocument();
  });

  it('falls back to "{sportName} session" when title is null', () => {
    renderMatches({ matches: [{ ...matches[0], title: null }] });
    expect(screen.getByText('football session')).toBeInTheDocument();
  });
});
