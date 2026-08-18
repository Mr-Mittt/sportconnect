import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

const user = { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com' };

describe('TopBar', () => {
  it('shows the user initials', () => {
    render(<TopBar user={user} onLogout={vi.fn()} />);
    expect(screen.getByText('JL')).toBeInTheDocument();
  });

  it('search and notifications are separate click targets from the account menu', async () => {
    const player = userEvent.setup();
    const onSearchClick = vi.fn();
    const onNotificationsClick = vi.fn();
    const onLogout = vi.fn();
    render(
      <TopBar
        user={user}
        onSearchClick={onSearchClick}
        onNotificationsClick={onNotificationsClick}
        onLogout={onLogout}
      />,
    );

    await player.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
    expect(onNotificationsClick).not.toHaveBeenCalled();

    await player.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(onNotificationsClick).toHaveBeenCalledTimes(1);
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it('opens the account menu on click, showing the identity header', async () => {
    const player = userEvent.setup();
    render(<TopBar user={user} onLogout={vi.fn()} />);

    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    await player.click(screen.getByRole('button', { name: 'Your account' }));

    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('calls onLogout when the Log out item is selected', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    await player.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes the menu on Escape without calling onLogout', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();

    await player.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('renders no unread badge when unreadCount is 0 or omitted', () => {
    render(<TopBar user={user} onLogout={vi.fn()} />);
    expect(screen.queryByLabelText(/unread notifications/i)).not.toBeInTheDocument();
  });

  it('renders the unread count on the bell icon', () => {
    render(<TopBar user={user} onLogout={vi.fn()} unreadCount={3} />);
    expect(screen.getByLabelText('3 unread notifications')).toHaveTextContent('3');
  });

  it('caps the displayed badge at 99+', () => {
    render(<TopBar user={user} onLogout={vi.fn()} unreadCount={150} />);
    expect(screen.getByLabelText('150 unread notifications')).toHaveTextContent('99+');
  });
});
