import type { Meta, StoryObj } from '@storybook/react-vite';
import { InviteFriendModal } from './InviteFriendModal';

const meta = {
  title: 'Groups/InviteFriendModal',
  component: InviteFriendModal,
  args: {
    isOpen: true,
    onClose: () => {},
    initialQuery: '',
  },
} satisfies Meta<typeof InviteFriendModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** Pre-filled from GroupMembersTab's "find member" input at the moment "Invite friend" was clicked. */
export const PreFilled: Story = {
  args: { initialQuery: 'robin' },
};
