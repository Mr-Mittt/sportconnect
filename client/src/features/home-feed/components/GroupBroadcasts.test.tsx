import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupBroadcast } from '../types';
import { GroupBroadcasts } from './GroupBroadcasts';

const makeBroadcast = (id: string, groupName: string, text: string): GroupBroadcast => ({
  id,
  groupId: `group-${id}`,
  groupName,
  groupInitials: 'XX',
  colorRamp: 'teal',
  text,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
});

const broadcasts = [
  makeBroadcast('broadcast-1', 'Riverside Ballers', 'Court booking confirmed for Sunday.'),
  makeBroadcast('broadcast-2', 'FC Weekend Warriors', 'Tournament bracket is posted.'),
];

describe('GroupBroadcasts', () => {
  it('renders group name, computed relative time, and message per broadcast', () => {
    render(<GroupBroadcasts broadcasts={broadcasts} onBroadcastClick={() => {}} />);
    expect(screen.getByText('Riverside Ballers')).toBeInTheDocument();
    expect(screen.getAllByText('2h ago')).toHaveLength(2); // computed from createdAt
    expect(screen.getByText('Court booking confirmed for Sunday.')).toBeInTheDocument();
  });

  it('the whole row is one clickable button per broadcast', () => {
    render(<GroupBroadcasts broadcasts={broadcasts} onBroadcastClick={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('reports the broadcast id on click', async () => {
    const user = userEvent.setup();
    const onBroadcastClick = vi.fn();
    render(<GroupBroadcasts broadcasts={broadcasts} onBroadcastClick={onBroadcastClick} />);
    await user.click(screen.getByRole('button', { name: /FC Weekend Warriors/ }));
    expect(onBroadcastClick).toHaveBeenCalledWith('broadcast-2');
  });

  it('renders the empty state with the header intact', () => {
    render(<GroupBroadcasts broadcasts={[]} onBroadcastClick={() => {}} />);
    expect(screen.getByText('No broadcasts from your groups.')).toBeInTheDocument();
    expect(screen.getByText('Group broadcasts')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
