import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './CreateGroupModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const meta = {
  title: 'Groups/CreateGroupModal',
  component: CreateGroupModal,
  args: {
    isOpen: true,
    onClose: () => {},
    sportsByKey,
    lockedSport: null,
    onSubmit: () => {},
    isSubmitting: false,
    isError: false,
  },
} satisfies Meta<typeof CreateGroupModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No active sport filter on the Groups page ("All") — shows the sport picker. */
export const SportPicker: Story = {};

/** Opened while Football is the active sport filter — sport is locked, no picker shown. */
export const LockedSport: Story = {
  args: { lockedSport: 'football' },
};

export const Submitting: Story = {
  args: { lockedSport: 'football', isSubmitting: true },
};

export const ErrorState: Story = {
  args: { lockedSport: 'football', isError: true },
};
