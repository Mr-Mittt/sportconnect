import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupInvitation, GroupMember, JoinRequest } from '@/features/feed/types';
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

const baseProps = {
  canManage: false,
  // undefined by default (not one of any test's member fixtures) — the
  // "(you)" test below sets this explicitly rather than every other test
  // needing to pick non-colliding userIds for its member() fixtures.
  currentUserId: undefined as string | undefined,
  joinRequests: [] as JoinRequest[],
  isJoinRequestsLoading: false,
  isJoinRequestsError: false,
  onRetryJoinRequests: vi.fn(),
  onAcceptJoinRequest: vi.fn(),
  onDeclineJoinRequest: vi.fn(),
  isAcceptingJoinRequest: false,
  isDecliningJoinRequest: false,
  sentInvitations: [] as GroupInvitation[],
  isSentInvitationsLoading: false,
  isSentInvitationsError: false,
  onRetrySentInvitations: vi.fn(),
  administrators: [] as GroupMember[],
  members: [] as GroupMember[],
  isMembersLoading: false,
  isMembersError: false,
  onRetryMembers: vi.fn(),
  onInviteFriend: vi.fn(),
};

describe('GroupMembersTab', () => {
  it('hides "Waiting for group approve" for a non-owner/admin (canManage=false)', () => {
    render(<GroupMembersTab {...baseProps} joinRequests={[joinRequest()]} />);
    expect(screen.queryByRole('region', { name: 'Waiting for group approve' })).not.toBeInTheDocument();
  });

  it('shows "Waiting for group approve" with Accept/Decline for an owner/admin', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(
      <GroupMembersTab
        {...baseProps}
        canManage
        joinRequests={[joinRequest({ id: 7, userFullName: 'Priya Shah' })]}
        onAcceptJoinRequest={onAccept}
        onDeclineJoinRequest={onDecline}
      />,
    );
    const section = screen.getByRole('region', { name: 'Waiting for group approve' });
    expect(within(section).getByText('Priya Shah')).toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith(7);

    await user.click(within(section).getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalledWith(7);
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
    expect(within(section).getByText('Awaiting owner approval')).toBeInTheDocument();
    expect(within(section).getByText("Awaiting Sam's response")).toBeInTheDocument();
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
