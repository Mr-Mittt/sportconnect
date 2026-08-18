import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '../types';
import { NotificationRow } from './NotificationRow';

const notification: Notification = {
  id: 7,
  type: 'session.comment.created',
  entityType: 'SESSION',
  entityId: '42',
  actorIds: ['actor-1'],
  actorCount: 1,
  isRead: false,
  createdAt: '2026-08-18T09:00:00',
  updatedAt: '2026-08-18T09:00:00',
  actors: [{ id: 'actor-1', fullName: 'Alice Nguyen' }],
  entityTitle: 'Friday Pickup Game',
};

// The notification text now renders as multiple bold/plain <span> segments
// (per-actor/title bolding), so RTL's default getByText (direct-text-node
// only) can't match the full sentence — match on the full concatenated
// textContent of a single element instead.
function fullText(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

describe('NotificationRow', () => {
  it('renders the derived notification text', () => {
    render(<NotificationRow notification={notification} onSelect={vi.fn()} />);
    expect(screen.getByText(fullText('Alice Nguyen commented on "Friday Pickup Game"'))).toBeInTheDocument();
  });

  it('bolds only the actor name and the entity title, not the connector words', () => {
    render(<NotificationRow notification={notification} onSelect={vi.fn()} />);
    expect(screen.getByText('Alice Nguyen')).toHaveClass('font-medium');
    expect(screen.getByText('"Friday Pickup Game"')).toHaveClass('font-medium');
    expect(screen.getByText('commented on')).not.toHaveClass('font-medium');
  });

  it('unread: light-blue bullet, black content text', () => {
    const { container } = render(<NotificationRow notification={notification} onSelect={vi.fn()} />);
    const bullet = container.querySelector('[aria-hidden="true"]');
    expect(bullet).toHaveClass('bg-border-accent');
    expect(screen.getByText(fullText('Alice Nguyen commented on "Friday Pickup Game"'))).toHaveClass(
      'text-text-primary',
    );
  });

  it('read: gray bullet, gray content text', () => {
    const { container } = render(
      <NotificationRow notification={{ ...notification, isRead: true }} onSelect={vi.fn()} />,
    );
    const bullet = container.querySelector('[aria-hidden="true"]');
    expect(bullet).toHaveClass('bg-text-secondary');
    expect(screen.getByText(fullText('Alice Nguyen commented on "Friday Pickup Game"'))).toHaveClass(
      'text-text-secondary',
    );
  });

  it('marks an unread row for assistive tech', () => {
    render(<NotificationRow notification={notification} onSelect={vi.fn()} />);
    expect(screen.getByText('Unread')).toBeInTheDocument();
  });

  it('does not mark a read row as unread', () => {
    render(<NotificationRow notification={{ ...notification, isRead: true }} onSelect={vi.fn()} />);
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
  });

  it('calls onSelect with the notification when clicked', async () => {
    const player = userEvent.setup();
    const onSelect = vi.fn();
    render(<NotificationRow notification={notification} onSelect={onSelect} />);

    await player.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith(notification);
  });
});
