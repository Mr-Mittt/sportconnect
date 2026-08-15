import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Group } from '@/features/feed/types';
import { GroupSpaceSwitcher } from './GroupSpaceSwitcher';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
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

  it('clicking a group pill calls onSelect with that group id and its sportId', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const groups = [group({ id: 1, groupName: 'Riverside Ballers', sportId: 5 })];

    renderSwitcher({ groups, onSelect });

    await user.click(screen.getByRole('button', { name: /Riverside Ballers/ }));
    expect(onSelect).toHaveBeenCalledWith(1, 5);
  });

  it('clicking All calls onSelect with null', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderSwitcher({ groups: [group({ id: 1 })], selectedGroupId: 1, onSelect });

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('renders only the "All" pill when there are no groups for this sport (no Join/Create — see GroupDiscoveryPanel)', () => {
    renderSwitcher();

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Group options' })).not.toBeInTheDocument();
  });

  it('renders a skeleton while loading', () => {
    renderSwitcher({ isLoading: true });

    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  it('renders an error+retry state on error', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderSwitcher({ isError: true, onRetry });

    expect(screen.getByText("Couldn't load your groups.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
