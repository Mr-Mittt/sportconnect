import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Group } from '@/features/feed/types';
import { GroupSpaceSwitcher } from './GroupSpaceSwitcher';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

function group(overrides: Partial<Group>): Group {
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
    memberCount: 12,
    currentUserRole: 'MEMBER',
    createdAt: '2026-07-01T00:00:00',
    updatedAt: '2026-07-01T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

describe('GroupSpaceSwitcher', () => {
  it('always renders the All pill', () => {
    render(
      <GroupSpaceSwitcher
        groups={[]}
        selectedGroupId={null}
        onSelect={() => {}}
        onCreateGroup={() => {}}
        onJoinGroup={() => {}}
        sportsByKey={sportsByKey}
      />,
    );

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a pill per group and marks the selected one active', () => {
    const groups = [group({ id: 1, groupName: 'Riverside Ballers' }), group({ id: 2, groupName: 'FC Weekend Warriors' })];

    render(
      <GroupSpaceSwitcher
        groups={groups}
        selectedGroupId={2}
        onSelect={() => {}}
        onCreateGroup={() => {}}
        onJoinGroup={() => {}}
        sportsByKey={sportsByKey}
      />,
    );

    expect(screen.getByRole('button', { name: /FC Weekend Warriors/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Riverside Ballers/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clicking a group pill calls onSelect with that group id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const groups = [group({ id: 1, groupName: 'Riverside Ballers' })];

    render(
      <GroupSpaceSwitcher
        groups={groups}
        selectedGroupId={null}
        onSelect={onSelect}
        onCreateGroup={() => {}}
        onJoinGroup={() => {}}
        sportsByKey={sportsByKey}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Riverside Ballers/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('clicking All calls onSelect with null', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <GroupSpaceSwitcher
        groups={[group({ id: 1 })]}
        selectedGroupId={1}
        onSelect={onSelect}
        onCreateGroup={() => {}}
        onJoinGroup={() => {}}
        sportsByKey={sportsByKey}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows Join/Create as buttons (no menu) when there are no groups for this sport', () => {
    render(
      <GroupSpaceSwitcher
        groups={[]}
        selectedGroupId={null}
        onSelect={() => {}}
        onCreateGroup={() => {}}
        onJoinGroup={() => {}}
        sportsByKey={sportsByKey}
      />,
    );

    expect(screen.getByRole('button', { name: 'Join Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group options' })).not.toBeInTheDocument();
  });

  it('collapses Join/Create into a "..." menu when groups exist', async () => {
    const user = userEvent.setup();
    const onJoinGroup = vi.fn();
    const onCreateGroup = vi.fn();

    render(
      <GroupSpaceSwitcher
        groups={[group({ id: 1 })]}
        selectedGroupId={null}
        onSelect={() => {}}
        onCreateGroup={onCreateGroup}
        onJoinGroup={onJoinGroup}
        sportsByKey={sportsByKey}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Join Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Group options' }));
    await user.click(await screen.findByText('Join Group'));
    expect(onJoinGroup).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Group options' }));
    await user.click(await screen.findByText('Create Group'));
    expect(onCreateGroup).toHaveBeenCalled();
  });
});
