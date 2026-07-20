import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Group } from '@/features/feed/types';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupDiscoveryPanel } from './GroupDiscoveryPanel';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
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
  sportsByKey,
  onOpenGroup: vi.fn(),
  onCreateGroup: vi.fn(),
  onJoinGroup: vi.fn(),
  isLoading: false,
  isError: false,
  onRetry: vi.fn(),
};

describe('GroupDiscoveryPanel', () => {
  it('shows an empty state when there are no joined groups', () => {
    render(<GroupDiscoveryPanel {...baseProps} groups={[]} />);
    expect(screen.getByText("You haven't joined any groups yet.")).toBeInTheDocument();
  });

  it('shows a loading skeleton', () => {
    render(<GroupDiscoveryPanel {...baseProps} groups={[]} isLoading />);
    expect(screen.queryByText("You haven't joined any groups yet.")).not.toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<GroupDiscoveryPanel {...baseProps} groups={[]} isError onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders a card per group, with member count, and opens it on click', async () => {
    const user = userEvent.setup();
    const onOpenGroup = vi.fn();
    render(
      <GroupDiscoveryPanel
        {...baseProps}
        onOpenGroup={onOpenGroup}
        groups={[group({ id: 7, sportId: 5, groupName: 'Downtown Strikers', memberCount: 12 })]}
      />,
    );

    expect(screen.getByText('12 members')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Downtown Strikers' }));
    expect(onOpenGroup).toHaveBeenCalledWith(7, 5);
  });

  it('Join/Create fire with an empty string when nothing was typed', async () => {
    const user = userEvent.setup();
    const onJoinGroup = vi.fn();
    const onCreateGroup = vi.fn();
    render(
      <GroupDiscoveryPanel {...baseProps} onJoinGroup={onJoinGroup} onCreateGroup={onCreateGroup} groups={[]} />,
    );

    await user.click(screen.getByRole('button', { name: 'Join Group' }));
    await user.click(screen.getByRole('button', { name: 'Create Group' }));
    expect(onJoinGroup).toHaveBeenCalledWith('');
    expect(onCreateGroup).toHaveBeenCalledWith('');
  });

  it('passes the shared input’s trimmed text to whichever button is clicked', async () => {
    const user = userEvent.setup();
    const onJoinGroup = vi.fn();
    const onCreateGroup = vi.fn();
    render(
      <GroupDiscoveryPanel {...baseProps} onJoinGroup={onJoinGroup} onCreateGroup={onCreateGroup} groups={[]} />,
    );

    await user.type(screen.getByLabelText('Group name or invite code'), '  Riverside Ballers  ');
    await user.click(screen.getByRole('button', { name: 'Join Group' }));
    expect(onJoinGroup).toHaveBeenCalledWith('Riverside Ballers');

    await user.click(screen.getByRole('button', { name: 'Create Group' }));
    expect(onCreateGroup).toHaveBeenCalledWith('Riverside Ballers');
  });
});
