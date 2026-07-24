import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GroupInvitation, GroupMember, JoinRequest } from '@/features/feed/types';
import type { ApprovalQueueItem } from '../useGroupMembersTabData';
import { GroupMembersTab } from './GroupMembersTab';

const joinRequests: JoinRequest[] = [
  {
    id: 1,
    groupId: 1,
    groupName: 'Riverside Ballers',
    userId: 'user-2',
    userFullName: 'Priya Shah',
    userAvatarUrl: null,
    status: 'pending',
    message: null,
    reviewedBy: null,
    reviewedByFullName: null,
    reviewedAt: null,
    createdAt: '2026-07-16T00:00:00',
    updatedAt: '2026-07-16T00:00:00',
  },
];

// GRP-7: a pending_owner invitation (a member's, not the owner's own — an
// owner-authored invite skips pending_owner per B11) merged into the same
// approval queue as the join request above.
const approvalQueueInvitation: GroupInvitation = {
  id: 2,
  groupId: 1,
  groupName: 'Riverside Ballers',
  inviterId: 'user-5',
  inviterFullName: 'Sam Ito',
  inviteeId: 'user-8',
  inviteeFullName: 'Morgan Diaz',
  status: 'pending_owner',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-07-16T12:00:00',
  updatedAt: '2026-07-16T12:00:00',
};

const approvalQueue: ApprovalQueueItem[] = [
  { type: 'join_request', data: joinRequests[0]! },
  { type: 'invitation', data: approvalQueueInvitation },
];

const sentInvitations: GroupInvitation[] = [
  {
    id: 1,
    groupId: 1,
    groupName: 'Riverside Ballers',
    inviterId: 'user-1',
    inviterFullName: 'Jordan Lee',
    inviteeId: 'user-3',
    inviteeFullName: 'Robin Park',
    status: 'pending_owner',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-07-17T00:00:00',
    updatedAt: '2026-07-17T00:00:00',
  },
  {
    id: 2,
    groupId: 1,
    groupName: 'Riverside Ballers',
    inviterId: 'user-1',
    inviterFullName: 'Jordan Lee',
    inviteeId: 'user-4',
    inviteeFullName: 'Sam Ito',
    status: 'pending_user',
    reviewedBy: 'user-1',
    reviewedAt: '2026-07-17T00:00:00',
    createdAt: '2026-07-16T00:00:00',
    updatedAt: '2026-07-17T00:00:00',
  },
];

const administrators: GroupMember[] = [
  {
    id: 1,
    groupId: 1,
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    roleId: 1,
    roleName: 'group_owner',
    roleLevel: 3,
    joinedAt: '2026-06-01T00:00:00',
  },
  {
    id: 2,
    groupId: 1,
    userId: 'user-5',
    userFullName: 'Sam Ito',
    userAvatarUrl: null,
    roleId: 2,
    roleName: 'group_admin',
    roleLevel: 2,
    joinedAt: '2026-06-02T00:00:00',
  },
];

const members: GroupMember[] = [
  {
    id: 3,
    groupId: 1,
    userId: 'user-6',
    userFullName: 'Alex Chen',
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-06-03T00:00:00',
  },
  {
    id: 4,
    groupId: 1,
    userId: 'user-7',
    userFullName: 'Priya Shah',
    userAvatarUrl: null,
    roleId: 3,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-06-04T00:00:00',
  },
];

const meta = {
  title: 'Groups/GroupMembersTab',
  component: GroupMembersTab,
  args: {
    canManage: false,
    // Matches administrators[0].userId below — the default variants show
    // the "(you)" indicator on the owner row.
    currentUserId: 'user-1',
    approvalQueue: [],
    isApprovalQueueLoading: false,
    isApprovalQueueError: false,
    onRetryApprovalQueue: () => {},
    onAcceptItem: () => {},
    onDeclineItem: () => {},
    isAcceptingItem: false,
    isDecliningItem: false,
    sentInvitations: [],
    isSentInvitationsLoading: false,
    isSentInvitationsError: false,
    onRetrySentInvitations: () => {},
    onCancelInvitation: () => {},
    isCancelingInvitation: false,
    administrators: [],
    members: [],
    isMembersLoading: false,
    isMembersError: false,
    onRetryMembers: () => {},
    onInviteFriend: () => {},
  },
} satisfies Meta<typeof GroupMembersTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Member: no "Waiting for group approve" section, every list read-only. */
export const AsMemberPopulated: Story = {
  args: { administrators, members },
};

export const AsMemberEmpty: Story = {};

/** Admin: "Waiting for group approve" visible with Accept/Decline — GRP-7's
 * merged queue shows a join-request row and a pending_owner invitation row
 * together. */
export const AsAdminPopulated: Story = {
  args: { canManage: true, approvalQueue, sentInvitations, administrators, members },
};

export const AsAdminEmpty: Story = {
  args: { canManage: true },
};

/** Owner renders identically to Admin in this component — role gating is a
 * binary `canManage`, not a 3-way switch — included for the ticket's
 * explicit "owner/admin/member" acceptance-criteria wording. */
export const AsOwnerPopulated: Story = {
  args: { canManage: true, approvalQueue, sentInvitations, administrators, members },
};

export const AsOwnerEmpty: Story = {
  args: { canManage: true },
};

export const MembersLoading: Story = {
  args: { canManage: true, isMembersLoading: true },
};

export const MembersLoadError: Story = {
  args: { canManage: true, isMembersError: true },
};
