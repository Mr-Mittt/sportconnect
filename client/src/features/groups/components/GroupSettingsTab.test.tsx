import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Group } from '@/features/feed/types';
import { GroupSettingsTab } from './GroupSettingsTab';

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: 'Weeknight pickup games.',
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
    ...overrides,
  };
}

const baseProps = {
  onUpdatePrivacy: vi.fn(),
  isUpdatingPrivacy: false,
  isUpdatePrivacyError: false,
  onLeave: vi.fn(),
  isLeaving: false,
  isLeaveError: false,
  onRequestDelete: vi.fn(),
};

describe('GroupSettingsTab', () => {
  it('member: privacy is read-only, no Delete button, Leave is enabled', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_member" />);

    expect(screen.queryByRole('button', { name: 'Public' })).not.toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Only the owner and admins can change this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeEnabled();
  });

  it('admin: can edit privacy, no Delete button', async () => {
    const user = userEvent.setup();
    const onUpdatePrivacy = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onUpdatePrivacy={onUpdatePrivacy}
        group={group()}
        currentUserRole="group_admin"
      />,
    );

    const privateButton = screen.getByRole('button', { name: 'Private' });
    await user.click(privateButton);
    expect(onUpdatePrivacy).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
  });

  it('owner: can edit privacy, Delete button visible and opens the confirm flow, Leave is disabled', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onRequestDelete={onRequestDelete}
        group={group()}
        currentUserRole="group_owner"
      />,
    );

    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeDisabled();
    expect(
      screen.getByText('Transfer ownership to another member before you can leave.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    expect(onRequestDelete).toHaveBeenCalled();
  });

  it('surfaces a privacy update error', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        isUpdatePrivacyError
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update privacy. Try again.");
  });
});
