import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '../types';
import { NotificationBell } from './NotificationBell';

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
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
    ...overrides,
  };
}

// The notification text renders as multiple bold/plain <span> segments, so
// RTL's default getByText (direct-text-node only) can't match the full
// sentence, and jsdom's accessible-name computation doesn't insert spaces
// between adjacent segment spans either — match on an element's full
// concatenated textContent instead.
function fullText(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

function baseProps() {
  return {
    unreadCount: 0,
    isOpen: false,
    onOpenChange: vi.fn(),
    notifications: [] as Notification[],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: vi.fn(),
    onSelect: vi.fn(),
    hasUnreadLoaded: false,
    onMarkAllRead: vi.fn(),
    isMarkingAllRead: false,
  };
}

describe('NotificationBell', () => {
  it('renders no badge when unreadCount is 0', () => {
    render(<NotificationBell {...baseProps()} />);
    expect(screen.queryByLabelText(/unread notifications/i)).not.toBeInTheDocument();
  });

  it('renders the unread count on the bell icon', () => {
    render(<NotificationBell {...baseProps()} unreadCount={3} />);
    expect(screen.getByLabelText('3 unread notifications')).toHaveTextContent('3');
  });

  it('caps the displayed badge at 99+', () => {
    render(<NotificationBell {...baseProps()} unreadCount={150} />);
    expect(screen.getByLabelText('150 unread notifications')).toHaveTextContent('99+');
  });

  it('calls onOpenChange when the bell is clicked', async () => {
    const player = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NotificationBell {...baseProps()} onOpenChange={onOpenChange} />);

    await player.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows a loading state', () => {
    render(<NotificationBell {...baseProps()} isOpen isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<NotificationBell {...baseProps()} isOpen isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load notifications.");
  });

  it('shows an empty state when there are no notifications', () => {
    render(<NotificationBell {...baseProps()} isOpen />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it('renders each notification row and calls onSelect when clicked', async () => {
    const player = userEvent.setup();
    const onSelect = vi.fn();
    const n = notification();
    render(<NotificationBell {...baseProps()} isOpen notifications={[n]} onSelect={onSelect} />);

    await player.click(screen.getByText(fullText('Alice Nguyen commented on "Friday Pickup Game"')));

    expect(onSelect).toHaveBeenCalledWith(n);
  });

  it('shows "Mark all read" only when hasUnreadLoaded, and wires it to onMarkAllRead', async () => {
    const player = userEvent.setup();
    const onMarkAllRead = vi.fn();
    const { rerender } = render(<NotificationBell {...baseProps()} isOpen hasUnreadLoaded={false} onMarkAllRead={onMarkAllRead} />);
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();

    rerender(<NotificationBell {...baseProps()} isOpen hasUnreadLoaded onMarkAllRead={onMarkAllRead} />);
    await player.click(screen.getByRole('button', { name: 'Mark all read' }));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows "Load more" only when hasNextPage, and wires it to onLoadMore', async () => {
    const player = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<NotificationBell {...baseProps()} isOpen hasNextPage onLoadMore={onLoadMore} />);

    await player.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
