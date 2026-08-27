import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportProfile } from '@/shared/types/sport';
import { SportSwitcher } from './SportSwitcher';

const threeSports: SportProfile[] = [
  { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
];

const meta = {
  title: 'Shared/SportSwitcher',
  component: SportSwitcher,
} satisfies Meta<typeof SportSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllActive: Story = {
  args: { sports: threeSports, active: 'all', onChange: () => {}, onAddSport: () => {} },
};

export const BasketballActive: Story = {
  args: { sports: threeSports, active: 'basketball', onChange: () => {}, onAddSport: () => {} },
};

/** At the 3-sport cap the Add pill stays visible (mockup parity) but is aria-disabled. */
export const AtSportCap: Story = {
  args: { sports: threeSports, active: 'all', onChange: () => {}, onAddSport: () => {} },
};

export const BelowCapTwoSports: Story = {
  args: {
    sports: threeSports.slice(0, 2),
    active: 'all',
    onChange: () => {},
    onAddSport: () => {},
  },
};

/** PROFILE-4: `/profile` has no `'all'` state — the pill is hidden entirely. */
export const NoAllPill: Story = {
  args: {
    sports: threeSports,
    active: 'football',
    onChange: () => {},
    onAddSport: () => {},
    showAllPill: false,
  },
};
