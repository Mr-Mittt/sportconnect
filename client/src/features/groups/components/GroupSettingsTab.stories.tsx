import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Group } from '@/features/feed/types';
import { GroupSettingsTab } from './GroupSettingsTab';

const group: Group = {
  id: 1,
  sportId: 5,
  groupName: 'Riverside Ballers',
  description: 'Weeknight pickup games for intermediate players.',
  avatarUrl: null,
  coverUrl: null,
  isPrivate: false,
  isActive: true,
  createdBy: 'user-1',
  createdByFullName: 'Jordan Lee',
  memberCount: 42,
  currentUserRole: 'group_member',
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
  pinnedPosts: null,
};

const meta = {
  title: 'Groups/GroupSettingsTab',
  component: GroupSettingsTab,
  args: {
    group,
    currentUserRole: 'group_member',
    onUpdatePrivacy: () => {},
    isUpdatingPrivacy: false,
    isUpdatePrivacyError: false,
    onLeave: () => {},
    isLeaving: false,
    isLeaveError: false,
    onRequestDelete: () => {},
  },
} satisfies Meta<typeof GroupSettingsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Member: everything read-only, no Delete button. */
export const AsMember: Story = {};

/** Admin: can edit Privacy, no Delete button. */
export const AsAdmin: Story = {
  args: { currentUserRole: 'group_admin' },
};

/** Owner: can edit Privacy, Delete Group at the bottom, Leave disabled. */
export const AsOwner: Story = {
  args: { currentUserRole: 'group_owner' },
};

export const PrivacyUpdateError: Story = {
  args: { currentUserRole: 'group_owner', isUpdatePrivacyError: true },
};

export const LeaveError: Story = {
  args: { currentUserRole: 'group_member', isLeaveError: true },
};
