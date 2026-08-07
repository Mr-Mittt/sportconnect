import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
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

const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

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

function makeSession(overrides: Partial<Session> & Pick<Session, 'id' | 'sportId'>): Session {
  return {
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportName: 'Football',
    title: 'Match',
    description: null,
    location: makeLocation('Central Turf Park'),
    locationNote: null,
    scheduledStart: hoursFromNow(24),
    scheduledEndAt: null,
    status: 'SCHEDULED',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 2,
    capacity: 10,
    feeType: 'FREE',
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    createdAt: '2026-06-01T10:00:00',
    updatedAt: '2026-06-01T10:00:00',
    ...overrides,
  };
}

const matches: Session[] = [
  makeSession({
    id: 1,
    sportId: SPORT_ID.football,
    title: 'FC Weekend Warriors vs Riverside FC',
    scheduledStart: hoursFromNow(24),
    location: makeLocation('Central Turf Park'),
    status: 'SCHEDULED',
  }),
  makeSession({
    id: 2,
    sportId: SPORT_ID.basketball,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    scheduledStart: hoursFromNow(72),
    location: makeLocation('Riverside Courts'),
    status: 'ONGOING',
  }),
  makeSession({
    id: 3,
    sportId: SPORT_ID.tennis,
    sportName: 'Tennis',
    title: 'Singles ladder match vs D. Alvarez',
    scheduledStart: hoursFromNow(96),
    location: makeLocation('Greenwood Club'),
    status: 'CANCELLED',
  }),
];

const manyFootballMatches: Session[] = Array.from({ length: 6 }, (_, i) =>
  makeSession({
    id: 100 + i,
    sportId: SPORT_ID.football,
    title: `Five-a-side league round ${i + 1}`,
    scheduledStart: hoursFromNow(24 * (i + 1)),
    location: makeLocation('Central Turf Park'),
  }),
);

const meta = {
  title: 'Shared/UpcomingMatches',
  component: UpcomingMatches,
  args: {
    sportsByKey,
    onSeeAll: () => {},
    onSelectMatch: () => {},
    onCreateMatch: () => {},
    onJoinMatch: () => {},
  },
  // Constrain to the right rail's width so stories match the page context
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
} satisfies Meta<typeof UpcomingMatches>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mockup parity: a scheduled, an ongoing, and a cancelled session — distinct status badges. */
export const AllSports: Story = {
  args: { matches, activeSport: 'all' },
};

export const FilteredBasketball: Story = {
  args: { matches, activeSport: 'basketball' },
};

/** Cancelled session only — the muted-danger status badge, "View details" CTA unchanged. */
export const FilteredTennisCancelled: Story = {
  args: { matches, activeSport: 'tennis' },
};

export const EmptyForSport: Story = {
  args: { matches: matches.filter((m) => m.sportId !== SPORT_ID.tennis), activeSport: 'tennis' },
};

/** Six matches in, four rendered — the rest are behind "See all". */
export const CappedAtFour: Story = {
  args: { matches: manyFootballMatches, activeSport: 'all' },
};
