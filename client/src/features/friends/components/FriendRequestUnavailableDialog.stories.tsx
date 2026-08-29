import type { Meta, StoryObj } from '@storybook/react-vite';
import { FriendRequestUnavailableDialog } from './FriendRequestUnavailableDialog';

/**
 * CLIENT-NOTIF-5. Renders open only — the dialog exists solely in its open state
 * (a closed story is a blank canvas), same convention as `NoSportsToAddDialog`.
 */
const meta = {
  title: 'Friends/FriendRequestUnavailableDialog',
  component: FriendRequestUnavailableDialog,
  parameters: { layout: 'centered' },
  args: {
    isOpen: true,
    onClose: () => {},
  },
} satisfies Meta<typeof FriendRequestUnavailableDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
