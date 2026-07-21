import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Group, GroupSettings } from '@/features/feed/types';
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

const groupSettings: GroupSettings = {
  id: 1,
  groupId: 1,
  allowMemberPosts: true,
  requirePostApproval: false,
  allowMemberInvites: false,
  groupTypeName: 'DEFAULT',
  createdAt: '2026-07-15T00:00:00',
  updatedAt: '2026-07-15T00:00:00',
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
    groupSettings,
    isSettingsLoading: false,
    isSettingsError: false,
    onUpdateSetting: () => {},
    hasUnsavedSettingsChanges: false,
    onSaveSettings: () => {},
    isSavingSettings: false,
    isSaveSettingsError: false,
  },
} satisfies Meta<typeof GroupSettingsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Member: everything read-only, no Delete button, toggles/group type read-only. */
export const AsMember: Story = {};

/** Admin: can edit Privacy, no Delete button; the three GroupSettings toggles stay read-only (owner-only). */
export const AsAdmin: Story = {
  args: { currentUserRole: 'group_admin' },
};

/** Owner: can edit Privacy and the three toggles, Delete Group at the bottom, Leave disabled. */
export const AsOwner: Story = {
  args: { currentUserRole: 'group_owner' },
};

export const PrivacyUpdateError: Story = {
  args: { currentUserRole: 'group_owner', isUpdatePrivacyError: true },
};

export const LeaveError: Story = {
  args: { currentUserRole: 'group_member', isLeaveError: true },
};

export const SettingsLoading: Story = {
  args: { currentUserRole: 'group_owner', isSettingsLoading: true },
};

export const SettingsLoadError: Story = {
  args: { currentUserRole: 'group_owner', isSettingsError: true },
};

/** Owner has toggled a setting — Save button enables. */
export const UnsavedSettingsChanges: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedSettingsChanges: true },
};

export const SavingSettings: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedSettingsChanges: true, isSavingSettings: true },
};

export const SaveSettingsError: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedSettingsChanges: true, isSaveSettingsError: true },
};
