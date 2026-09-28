import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { TopBar } from './TopBar';

const user = { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com' };

describe('TopBar', () => {
  it('shows the user initials', () => {
    render(<TopBar user={user} onLogout={vi.fn()} notificationBell={null} />);
    expect(screen.getByText('JL')).toBeInTheDocument();
  });

  it('renders the notificationBell slot as a separate click target from the account menu', async () => {
    const player = userEvent.setup();
    const onSearchClick = vi.fn();
    const onLogout = vi.fn();
    render(
      <TopBar
        user={user}
        onSearchClick={onSearchClick}
        onLogout={onLogout}
        notificationBell={<button type="button">Notifications</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    await player.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it('opens the account menu on click, showing the identity header', async () => {
    const player = userEvent.setup();
    render(<TopBar user={user} onLogout={vi.fn()} notificationBell={null} />);

    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    await player.click(screen.getByRole('button', { name: 'Your account' }));

    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('calls onLogout when the Log out item is selected', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} notificationBell={null} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    await player.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes the menu on Escape without calling onLogout', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} notificationBell={null} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();

    await player.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  // CLIENT-I18N-1's "small integration test that switching language re-renders a translated
  // component" — proof the infrastructure actually works end to end, not just that localeStore's
  // own unit tests pass. src/test/setup.ts's afterEach reverts i18n back to 'en' for every other
  // test in the suite.
  it('renders the Log out item in Vietnamese when the locale is vi (CLIENT-I18N-1)', async () => {
    const player = userEvent.setup();
    await i18n.changeLanguage('vi');
    render(<TopBar user={user} onLogout={vi.fn()} notificationBell={null} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));

    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();
  });
});
