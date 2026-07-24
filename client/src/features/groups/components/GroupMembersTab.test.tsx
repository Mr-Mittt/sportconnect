import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupInvitation, GroupMember, JoinRequest } from '@/features/feed/types';
import type { ApprovalQueueItem } from '../useGroupMembersTabData';
import { GroupMembersTab } from './GroupMembersTab';

function member(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    id: 1,
    groupId: 1,
    userId: 'user-1',
    userFullName: 'Jordan Lee',
    userAvatarUrl: null,
    roleId: 1,
    roleName: 'group_member',
    roleLevel: 1,
    joinedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

function joinRequest(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return {
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
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

function invitation(overrides: Partial<GroupInvitation> = {}): GroupInvitation {
  return {
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
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

// GRP-7: wraps the two fixture builders above into the merged queue's
// discriminated-union shape.
function joinRequestItem(overrides: Partial<JoinRequest> = {}): ApprovalQueueItem {
  return { type: 'join_request', data: joinRequest(overrides) };
}
function invitationItem(overrides: Partial<GroupInvitation> = {}): ApprovalQueueItem {
  return { type: 'invitation', data: invitation(overrides) };
}

const baseProps = {
  canManage: false,
  // undefined by default (not one of any test's member fixtures) — the
  // "(you)" test below sets this explicitly rather than every other test
  // needing to pick non-colliding userIds for its member() fixtures.
  currentUserId: undefined as string | undefined,
  approvalQueue: [] as ApprovalQueueItem[],
  isApprovalQueueLoading: false,
  isApprovalQueueError: false,
  onRetryApprovalQueue: vi.fn(),
  onAcceptItem: vi.fn(),
  onDeclineItem: vi.fn(),
  isAcceptingItem: false,
  isDecliningItem: false,
  sentInvitations: [] as GroupInvitation[],
  isSentInvitationsLoading: false,
  isSentInvitationsError: false,
  onRetrySentInvitations: vi.fn(),
  onCancelInvitation: vi.fn(),
  isCancelingInvitation: false,
  administrators: [] as GroupMember[],
  members: [] as GroupMember[],
  isMembersLoading: false,
  isMembersError: false,
  onRetryMembers: vi.fn(),
  onInviteFriend: vi.fn(),
};

describe('GroupMembersTab', () => {
  it('hides "Waiting for group approve" for a non-owner/admin (canManage=false)', () => {
    render(<GroupMembersTab {...baseProps} approvalQueue={[joinRequestItem()]} />);
    expect(screen.queryByRole('region', { name: 'Waiting for group approve' })).not.toBeInTheDocument();
  });

  it('shows "Waiting for group approve" with Accept/Decline for a join-request row', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const item = joinRequestItem({ id: 7, userFullName: 'Priya Shah' });
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        approvalQueue={[item]}
        onAcceptItem={onAccept}
        onDeclineItem={onDecline}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for group approve' });
    expect(within(section).getByText('Priya Shah')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith(item);

    await user.click(within(section).getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalledWith(item);
  });

  it('shows a pending_owner invitation row with the invitee\'s name and "Invited by", same Accept/Decline actions (GRP-7)', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const item = invitationItem({
      id: 9,
      inviterFullName: 'Sam Ito',
      inviteeFullName: 'Morgan Diaz',
    });
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        approvalQueue={[item]}
        onAcceptItem={onAccept}
        onDeclineItem={onDecline}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for group approve' });
    expect(within(section).getByText('Morgan Diaz')).toBeInTheDocument();
    expect(within(section).getByText('Invited by Sam Ito')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith(item);

    await user.click(within(section).getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalledWith(item);
  });

  it('merges join-request and invitation rows in the same "Waiting for group approve" list', () => {
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        approvalQueue={[
          joinRequestItem({ id: 1, userFullName: 'Priya Shah' }),
          invitationItem({ id: 2, inviteeFullName: 'Morgan Diaz' }),
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for group approve' });
    expect(within(section).getByText('Priya Shah')).toBeInTheDocument();
    expect(within(section).getByText('Morgan Diaz')).toBeInTheDocument();
  });

  it('hides "Waiting for user accept" entirely when there are no sent invitations', () => {
    render(<GroupMembersTab {...baseProps} sentInvitations={[]} />);
    expect(screen.queryByRole('region', { name: 'Waiting for user accept' })).not.toBeInTheDocument();
  });

  it('shows "Waiting for user accept" with a per-row status label distinguishing pending_owner/pending_user', () => {
    render(
      <GroupMembersTab
        {...baseProps}
        sentInvitations={[
          invitation({ id: 1, inviteeFullName: 'Robin Park', status: 'pending_owner' }),
          invitation({ id: 2, inviteeFullName: 'Sam Ito', status: 'pending_user' }),
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for user accept' });
    expect(within(section).getByText('Robin Park')).toBeInTheDocument();
    expect(within(section).getByText('Invitation sent — waiting for owner approval')).toBeInTheDocument();
    expect(within(section).getByText("Awaiting Sam's response")).toBeInTheDocument();
  });

  it('a pending_owner sent invitation gets a Withdraw button; a pending_user one does not (GRP-7 addendum)', async () => {
    const user = userEvent.setup();
    const onCancelInvitation = vi.fn();
    render(
      <GroupMembersTab
        {...baseProps}
        sentInvitations={[
          invitation({ id: 1, inviteeFullName: 'Robin Park', status: 'pending_owner' }),
          invitation({ id: 2, inviteeFullName: 'Sam Ito', status: 'pending_user' }),
        ]}
        onCancelInvitation={onCancelInvitation}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for user accept' });

    const robinRow = within(section).getByText('Robin Park').closest('div[class*="border-hairline"]') as HTMLElement;
    expect(within(robinRow).getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();

    const samRow = within(section).getByText('Sam Ito').closest('div[class*="border-hairline"]') as HTMLElement;
    expect(within(samRow).queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();

    await user.click(within(robinRow).getByRole('button', { name: 'Withdraw' }));
    expect(onCancelInvitation).toHaveBeenCalledWith(1);
  });

  it('splits Group administrator (owner first, then admin) from Members', () => {
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        administrators={[
          member({ id: 1, userFullName: 'Sam Ito', roleName: 'group_admin' }),
          member({ id: 2, userFullName: 'Jordan Lee', roleName: 'group_owner' }),
        ]}
        members={[member({ id: 3, userFullName: 'Alex Chen', roleName: 'group_member' })]}
      />,
    );
    const adminSection = screen.getByRole('region', { name: 'Group administrator' });
    expect(within(adminSection).getByText('Sam Ito')).toBeInTheDocument();
    expect(within(adminSection).getByText('Jordan Lee')).toBeInTheDocument();
    const membersSection = screen.getByRole('region', { name: 'Members' });
    expect(within(membersSection).getByText('Alex Chen')).toBeInTheDocument();
    expect(within(adminSection).queryByText('Alex Chen')).not.toBeInTheDocument();
  });

  it('always shows Blacklist as a permanent "Coming soon" empty state', () => {
    render(<GroupMembersTab {...baseProps} />);
    const section = screen.getByRole('region', { name: 'Blacklist' });
    expect(within(section).getByText('Coming soon.')).toBeInTheDocument();
  });

  it('filters all visible lists in place as "find member" changes, without navigation', async () => {
    const user = userEvent.setup();
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        administrators={[member({ id: 1, userFullName: 'Sam Ito', roleName: 'group_admin' })]}
        members={[
          member({ id: 2, userFullName: 'Alex Chen', roleName: 'group_member' }),
          member({ id: 3, userFullName: 'Priya Shah', roleName: 'group_member' }),
        ]}
      />,
    );
    await user.type(screen.getByLabelText('Find member'), 'priya');

    const membersSection = screen.getByRole('region', { name: 'Members' });
    expect(within(membersSection).getByText('Priya Shah')).toBeInTheDocument();
    expect(within(membersSection).queryByText('Alex Chen')).not.toBeInTheDocument();
    const adminSection = screen.getByRole('region', { name: 'Group administrator' });
    expect(within(adminSection).queryByText('Sam Ito')).not.toBeInTheDocument();
    expect(within(adminSection).getByText('No matches.')).toBeInTheDocument();
  });

  it('"find member" filters an invitation row by the invitee, not the inviter (GRP-7)', async () => {
    const user = userEvent.setup();
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        approvalQueue={[invitationItem({ inviterFullName: 'Sam Ito', inviteeFullName: 'Morgan Diaz' })]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for group approve' });

    await user.type(screen.getByLabelText('Find member'), 'morgan');
    expect(within(section).getByText('Morgan Diaz')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Find member'));
    await user.type(screen.getByLabelText('Find member'), 'sam');
    expect(within(section).getByText('No matches.')).toBeInTheDocument();
  });

  it('calls onInviteFriend with the current trimmed "find member" text', async () => {
    const user = userEvent.setup();
    const onInviteFriend = vi.fn();
    render(<GroupMembersTab {...baseProps} onInviteFriend={onInviteFriend} />);

    await user.type(screen.getByLabelText('Find member'), '  robin  ');
    await user.click(screen.getByRole('button', { name: /Invite friend/ }));
    expect(onInviteFriend).toHaveBeenCalledWith('robin');
  });

  it('marks the current user\'s own row with "(you)" in administrators/members, not on anyone else\'s', () => {
    render(
      <GroupMembersTab
        {...baseProps}
        currentUserId="user-2"
        administrators={[
          member({ id: 1, userId: 'user-2', userFullName: 'Jordan Lee', roleName: 'group_owner' }),
        ]}
        members={[member({ id: 2, userId: 'user-3', userFullName: 'Alex Chen', roleName: 'group_member' })]}
      />,
    );
    const adminSection = screen.getByRole('region', { name: 'Group administrator' });
    expect(within(adminSection).getByText('Jordan Lee', { exact: false })).toBeInTheDocument();
    expect(within(adminSection).getByText('(you)', { exact: false })).toBeInTheDocument();

    const membersSection = screen.getByRole('region', { name: 'Members' });
    expect(within(membersSection).getByText('Alex Chen', { exact: false })).toBeInTheDocument();
    expect(within(membersSection).queryByText('(you)', { exact: false })).not.toBeInTheDocument();
  });
});
