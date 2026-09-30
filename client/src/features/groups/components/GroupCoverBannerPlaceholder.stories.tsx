import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportProfile } from '@/shared/types/sport';
import { GroupCoverBannerPlaceholder } from './GroupCoverBannerPlaceholder';

const sport: SportProfile = { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' };

const meta = {
  title: 'Groups/GroupCoverBannerPlaceholder',
  component: GroupCoverBannerPlaceholder,
  args: { sport, onBack: () => {} },
} satisfies Meta<typeof GroupCoverBannerPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Selected group's sport is known (persisted alongside the id) — sport-ramp band and icon. */
export const SportKnown: Story = {};

/** Sport can't be resolved either — neutral band, no icon. */
export const SportUnknown: Story = {
  args: { sport: undefined },
};
