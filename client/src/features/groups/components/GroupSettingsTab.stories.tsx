import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type { Group, GroupInfo, GroupSettings } from '@/features/feed/types';
import { makeRecurrence, makeSessionsConfigData } from '../sessionConfig/fixtures';
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
    onCommitGroupInfoField: () => {},
    groupInfoFieldError: null,
    hasUnsavedPermissionChanges: false,
    onSavePermission: () => {},
    isSavingPermission: false,
    isSavePermissionError: false,
    sessionsConfig: makeSessionsConfigData({
      recurrences: [makeRecurrence(), makeRecurrence({ id: 2, startTime: '20:00:00' }), makeRecurrence({ id: 3, dayKey: 5, draft: true, missing: ['locationId'], locationId: null, location: null })],
    }),
  },
} satisfies Meta<typeof GroupSettingsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every section starts collapsed; the stories that show a section's content open it first. */
const openSections =
  (...names: string[]): NonNullable<Story['play']> =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of names) await userEvent.click(canvas.getByRole('button', { name }));
  };

/** The default view: General, Permission and Sessions all collapsed. */
export const AllCollapsed: Story = {
  args: { currentUserRole: 'group_owner' },
};

/** Member: everything read-only, no Delete button, toggles/group type read-only. */
export const AsMember: Story = { play: openSections('General', 'Permission', 'Sessions') };

/** Admin: can edit Privacy, no Delete button; the three GroupSettings toggles stay read-only (owner-only). */
export const AsAdmin: Story = {
  args: { currentUserRole: 'group_admin' },
  play: openSections('General', 'Permission', 'Sessions'),
};

/** Owner: can edit Privacy and the three toggles, Delete Group at the bottom, Leave disabled. */
export const AsOwner: Story = {
  args: { currentUserRole: 'group_owner' },
  play: openSections('General', 'Permission', 'Sessions'),
};

export const PrivacyUpdateError: Story = {
  args: { currentUserRole: 'group_owner', isUpdatePrivacyError: true },
  play: openSections('General'),
};

export const LeaveError: Story = {
  args: { currentUserRole: 'group_member', isLeaveError: true },
};

/** CLIENT-ERR-5: coded failures (403 `GROUP_ADMIN_REQUIRED`, `GROUP_OWNER_REQUIRED`, `GROUP_OWNER_CANNOT_LEAVE`) show their own lines. */
export const CodedErrors: Story = {
  args: {
    currentUserRole: 'group_admin',
    hasUnsavedPermissionChanges: true,
    isUpdatePrivacyError: true,
    privacyErrorText: 'Only the group owner or an admin can do this.',
    isLeaveError: true,
    leaveErrorText: "The owner can't leave the group. Transfer ownership first.",
    groupInfoFieldError: { key: 'rules', text: 'Only the group owner or an admin can do this.' },
  },
  play: openSections('General'),
};

export const SettingsLoading: Story = {
  args: { currentUserRole: 'group_owner', isSettingsLoading: true },
  play: openSections('General', 'Permission'),
};

export const SettingsLoadError: Story = {
  args: { currentUserRole: 'group_owner', isSettingsError: true },
  play: openSections('General', 'Permission'),
};

/** Owner has toggled a setting — the Save button of the Permission section enables. */
export const UnsavedPermissionChanges: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedPermissionChanges: true },
  play: openSections('Permission'),
};

export const SavingPermission: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedPermissionChanges: true, isSavingPermission: true },
  play: openSections('Permission'),
};

export const SavePermissionError: Story = {
  args: { currentUserRole: 'group_owner', hasUnsavedPermissionChanges: true, isSavePermissionError: true },
  play: openSections('Permission'),
};

/** A rules/schedule field whose save (on blur) failed: the error shows under it. */
export const RulesSaveError: Story = {
  args: { currentUserRole: 'group_admin', groupInfoFieldError: { key: 'rules' } },
  play: openSections('General'),
};

export const GroupInfoLoading: Story = {
  args: { currentUserRole: 'group_owner', isGroupInfoLoading: true },
  play: openSections('General'),
};

export const GroupInfoLoadError: Story = {
  args: { currentUserRole: 'group_owner', isGroupInfoError: true },
  play: openSections('General'),
};

/** Leave Group opens the confirmation (Stay / Leave). */
export const LeaveConfirmation: Story = {
  args: { currentUserRole: 'group_member' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Leave Group' }));
  },
};

/** No rules/schedule set yet — member view shows the empty-state copy. */
export const EmptyGroupInfo: Story = {
  args: {
    currentUserRole: 'group_member',
    groupInfo: { ...groupInfo, rules: null, schedule: null },
  },
  play: openSections('General'),
};
