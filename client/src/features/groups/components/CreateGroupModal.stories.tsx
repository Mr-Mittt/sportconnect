import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './CreateGroupModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
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
