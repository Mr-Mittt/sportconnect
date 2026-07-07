import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('shows the user initials', () => {
    render(<TopBar userInitials="BN" />);
    expect(screen.getByText('BN')).toBeInTheDocument();
  });

  it('search, notifications, and avatar are separate click targets', async () => {
    const user = userEvent.setup();
    const onSearchClick = vi.fn();
    const onNotificationsClick = vi.fn();
    const onAvatarClick = vi.fn();
    render(
      <TopBar
        userInitials="BN"
        onSearchClick={onSearchClick}
        onNotificationsClick={onNotificationsClick}
        onAvatarClick={onAvatarClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
    expect(onNotificationsClick).not.toHaveBeenCalled();
    expect(onAvatarClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(onNotificationsClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Your account' }));
    expect(onAvatarClick).toHaveBeenCalledTimes(1);
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });
});
