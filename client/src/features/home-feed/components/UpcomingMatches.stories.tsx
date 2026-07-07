import type { Meta, StoryObj } from '@storybook/react-vite';
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

const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

const matches: UpcomingMatch[] = [
  {
    id: 'match-1',
    sport: 'football',
    title: 'FC Weekend Warriors vs Riverside FC',
    startsAt: hoursFromNow(24),
    location: 'Central Turf Park',
    spotsLeft: 2,
  },
  {
    id: 'match-2',
    sport: 'basketball',
    title: 'Sunday pickup run',
    startsAt: hoursFromNow(72),
    location: 'Riverside Courts',
    spotsLeft: 4,
  },
  {
    id: 'match-3',
    sport: 'tennis',
    title: 'Singles ladder match vs D. Alvarez',
    startsAt: hoursFromNow(96),
    location: 'Greenwood Club',
    spotsLeft: 0, // full — CTA reads "Full, view details"
  },
];

const manyFootballMatches: UpcomingMatch[] = Array.from({ length: 6 }, (_, i) => ({
  id: `match-f${i + 1}`,
  sport: 'football',
  title: `Five-a-side league round ${i + 1}`,
  startsAt: hoursFromNow(24 * (i + 1)),
  location: 'Central Turf Park',
  spotsLeft: i % 3, // mixes full and open CTAs
}));

const meta = {
  title: 'HomeFeed/UpcomingMatches',
  component: UpcomingMatches,
  args: { sportsByKey, onSeeAll: () => {}, onSelectMatch: () => {} },
  // Constrain to the right rail's width so stories match the page context
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
} satisfies Meta<typeof UpcomingMatches>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mockup parity: two open matches and one full one (distinct CTA texts). */
export const AllSports: Story = {
  args: { matches, activeSport: 'all' },
};

export const FilteredBasketball: Story = {
  args: { matches, activeSport: 'basketball' },
};

/** Full match only — the muted "Full, view details" CTA state. */
export const FilteredTennisFull: Story = {
  args: { matches, activeSport: 'tennis' },
};

export const EmptyForSport: Story = {
  args: { matches: matches.filter((m) => m.sport !== 'tennis'), activeSport: 'tennis' },
};

/** Six matches in, four rendered — the rest are behind "See all". */
export const CappedAtFour: Story = {
  args: { matches: manyFootballMatches, activeSport: 'all' },
};
