import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupBroadcast } from '@/shared/types/rail';
import { GroupBroadcasts } from './GroupBroadcasts';

const makeBroadcast = (id: number, groupName: string, text: string): GroupBroadcast => ({
  id,
  groupId: id + 100,
  groupName,
  groupInitials: 'XX',
  colorRamp: 'teal',
  text,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
});

const broadcasts = [
  makeBroadcast(1, 'Riverside Ballers', 'Court booking confirmed for Sunday.'),
  makeBroadcast(2, 'FC Weekend Warriors', 'Tournament bracket is posted.'),
];

function renderBroadcasts(overrides: Partial<React.ComponentProps<typeof GroupBroadcasts>> = {}) {
  return render(
    <GroupBroadcasts
      broadcasts={broadcasts}
      onBroadcastClick={() => {}}
      isLoading={false}
      isError={false}
      onRetry={() => {}}
      {...overrides}
    />,
  );
}

describe('GroupBroadcasts', () => {
  it('renders group name, computed relative time, and message per broadcast', () => {
    renderBroadcasts();
    expect(screen.getByText('Riverside Ballers')).toBeInTheDocument();
    expect(screen.getAllByText('2h ago')).toHaveLength(2); // computed from createdAt
    expect(screen.getByText('Court booking confirmed for Sunday.')).toBeInTheDocument();
  });

  it('the whole row is one clickable button per broadcast', () => {
    renderBroadcasts();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('reports the broadcast id on click', async () => {
    const user = userEvent.setup();
    const onBroadcastClick = vi.fn();
    renderBroadcasts({ onBroadcastClick });
    await user.click(screen.getByRole('button', { name: /FC Weekend Warriors/ }));
    expect(onBroadcastClick).toHaveBeenCalledWith(2);
  });

  it('renders the empty state with the header intact', () => {
    renderBroadcasts({ broadcasts: [] });
    expect(screen.getByText('No broadcasts from your groups.')).toBeInTheDocument();
    expect(screen.getByText('Group broadcasts')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders a loading skeleton instead of rows or the empty state', () => {
    renderBroadcasts({ broadcasts: [], isLoading: true });
    expect(screen.getByText('Group broadcasts')).toBeInTheDocument();
    expect(screen.queryByText('No broadcasts from your groups.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders an error state with a retry action instead of rows or the empty state', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderBroadcasts({ broadcasts: [], isError: true, onRetry });
    expect(screen.getByText("Couldn't load group broadcasts.")).toBeInTheDocument();
    expect(screen.queryByText('No broadcasts from your groups.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
