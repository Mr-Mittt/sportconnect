import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupActionErrorDialog } from './GroupActionErrorDialog';

const meta = {
  title: 'Groups/GroupActionErrorDialog',
  component: GroupActionErrorDialog,
  args: {
    message: 'This invitation has already been handled.',
    onDismiss: () => {},
  },
} satisfies Meta<typeof GroupActionErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A list action hit a stale row (409): accept/decline/approve/cancel of something already handled. */
export const Conflict: Story = {};

/** The caller's right is gone (403), e.g. an admin demoted while the Members tab was open. */
export const Forbidden: Story = { args: { message: 'Only the group owner or an admin can do this.' } };

/** Accepting an invitation into a full group, with the cap interpolated. */
export const GroupFull: Story = { args: { message: 'This group is full (up to 30 members).' } };

export const Closed: Story = { args: { message: null } };
