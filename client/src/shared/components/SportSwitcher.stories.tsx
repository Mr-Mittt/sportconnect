import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportProfile } from '@/shared/types/sport';
import { SportSwitcher } from './SportSwitcher';

const threeSports: SportProfile[] = [
  { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
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
