import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Group, GroupInfo, GroupSettings } from '@/features/feed/types';
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

const groupInfo: GroupInfo = {
  groupId: 1,
  groupName: 'Riverside Ballers',
  isPrivate: false,
  description: null,
  avatarUrl: null,
  coverUrl: null,
  rules: 'Be on time. Bring both light and dark shirts.',
  schedule: 'Every Tuesday, 7pm at Riverside Courts.',
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
    groupInfo,
    isGroupInfoLoading: false,
    isGroupInfoError: false,
    onUpdateGroupInfoField: () => {},
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

/** CLIENT-ERR-5: coded failures (403 `GROUP_ADMIN_REQUIRED`, `GROUP_OWNER_REQUIRED`, `GROUP_OWNER_CANNOT_LEAVE`) show their own lines. */
export const CodedErrors: Story = {
  args: {
    currentUserRole: 'group_admin',
    hasUnsavedSettingsChanges: true,
    isUpdatePrivacyError: true,
    privacyErrorText: 'Only the group owner or an admin can do this.',
    isSaveSettingsError: true,
    saveSettingsErrorText: 'Only the group owner can do this.',
    isLeaveError: true,
    leaveErrorText: "The owner can't leave the group. Transfer ownership first.",
  },
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

export const GroupInfoLoading: Story = {
  args: { currentUserRole: 'group_owner', isGroupInfoLoading: true },
};

export const GroupInfoLoadError: Story = {
  args: { currentUserRole: 'group_owner', isGroupInfoError: true },
};

/** No rules/schedule set yet — member view shows the empty-state copy. */
export const EmptyGroupInfo: Story = {
  args: {
    currentUserRole: 'group_member',
    groupInfo: { ...groupInfo, rules: null, schedule: null },
  },
};
