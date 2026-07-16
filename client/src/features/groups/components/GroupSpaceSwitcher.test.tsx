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

function renderSwitcher(overrides: Partial<React.ComponentProps<typeof GroupSpaceSwitcher>> = {}) {
  return render(
    <GroupSpaceSwitcher
      groups={[]}
      selectedGroupId={null}
      onSelect={() => {}}
      onCreateGroup={() => {}}
      onJoinGroup={() => {}}
      sportsByKey={sportsByKey}
      isLoading={false}
      isError={false}
      onRetry={() => {}}
      {...overrides}
    />,
  );
}

describe('GroupSpaceSwitcher', () => {
  it('always renders the All pill', () => {
    renderSwitcher();

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a pill per group and marks the selected one active', () => {
    const groups = [group({ id: 1, groupName: 'Riverside Ballers' }), group({ id: 2, groupName: 'FC Weekend Warriors' })];

    renderSwitcher({ groups, selectedGroupId: 2 });

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

    renderSwitcher({ groups, onSelect });

    await user.click(screen.getByRole('button', { name: /Riverside Ballers/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('clicking All calls onSelect with null', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderSwitcher({ groups: [group({ id: 1 })], selectedGroupId: 1, onSelect });

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows Join/Create as buttons (no menu) when there are no groups for this sport', () => {
    renderSwitcher();

    expect(screen.getByRole('button', { name: 'Join Group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group options' })).not.toBeInTheDocument();
  });

  it('collapses Join/Create into a "..." menu when groups exist', async () => {
    const user = userEvent.setup();
    const onJoinGroup = vi.fn();
    const onCreateGroup = vi.fn();

    renderSwitcher({ groups: [group({ id: 1 })], onCreateGroup, onJoinGroup });

    expect(screen.queryByRole('button', { name: 'Join Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Group options' }));
    await user.click(await screen.findByText('Join Group'));
    expect(onJoinGroup).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Group options' }));
    await user.click(await screen.findByText('Create Group'));
    expect(onCreateGroup).toHaveBeenCalled();
  });

  it('renders a skeleton, not the "0 groups, join/create" fallback, while loading', () => {
    renderSwitcher({ isLoading: true });

    expect(screen.queryByRole('button', { name: 'Join Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  it('renders an error+retry state, not the "0 groups, join/create" fallback, on error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderSwitcher({ isError: true, onRetry });

    expect(screen.getByText("Couldn't load your groups.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
