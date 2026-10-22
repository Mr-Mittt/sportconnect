import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { TopBar } from './TopBar';

const user = { initials: 'JL', name: 'Jordan Lee', email: 'jordan@example.com', avatarUrl: null };

describe('TopBar', () => {
  // The vi test switches i18n directly (not via localeStore), which src/test/setup.ts's own
  // revert doesn't cover.
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the user initials', () => {
    render(<TopBar user={user} onLogout={vi.fn()} onOpenAccountSettings={vi.fn()} notificationBell={null} />);
    expect(screen.getByText('JL')).toBeInTheDocument();
  });

  describe('avatar (A36)', () => {
    const originalImage = window.Image;
    // Radix only renders the <img> after the browser loads it; jsdom never does, so a stand-in image that loads (or fails) on cue.
    function stubImage(outcome: 'load' | 'error') {
      class StubImage {
        referrerPolicy = '';
        crossOrigin: string | null = null;
        complete = false;
        naturalWidth = 0;
        private listeners = new Map<string, (event: { currentTarget: unknown }) => void>();
        addEventListener(type: string, listener: (event: { currentTarget: unknown }) => void) {
          this.listeners.set(type, listener);
        }
        removeEventListener(type: string) {
          this.listeners.delete(type);
        }
        set src(_value: string) {
          queueMicrotask(() => {
            this.complete = true;
            this.naturalWidth = outcome === 'load' ? 1 : 0;
            this.listeners.get(outcome)?.({ currentTarget: this });
          });
        }
      }
      window.Image = StubImage as unknown as typeof Image;
    }
    afterEach(() => {
      window.Image = originalImage;
    });

    it('shows the avatar picture in the account button and in the open menu when there is one', async () => {
      stubImage('load');
      const player = userEvent.setup();
      const { container } = render(
        <TopBar
          user={{ ...user, avatarUrl: 'https://lh3.googleusercontent.com/a/photo=s96-c' }}
          onLogout={vi.fn()}
          onOpenAccountSettings={vi.fn()}
          notificationBell={null}
        />,
      );
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo=s96-c'));
      expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');

      await player.click(screen.getByRole('button', { name: 'Your account' }));
      await vi.waitFor(() => expect(document.body.querySelectorAll('img')).toHaveLength(2));
    });

    it('keeps the initials when there is no avatar', () => {
      const { container } = render(<TopBar user={user} onLogout={vi.fn()} onOpenAccountSettings={vi.fn()} notificationBell={null} />);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('JL')).toBeInTheDocument();
    });

    it('falls back to the initials when the picture cannot be loaded', async () => {
      stubImage('error');
      const { container } = render(
        <TopBar user={{ ...user, avatarUrl: 'https://lh3.googleusercontent.com/gone' }} onLogout={vi.fn()} onOpenAccountSettings={vi.fn()} notificationBell={null} />,
      );
      expect(screen.getByText('JL')).toBeInTheDocument();
      await Promise.resolve();
      expect(container.querySelector('img')).toBeNull();
    });
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
        onOpenAccountSettings={vi.fn()}
        notificationBell={<button type="button">Notifications</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    await player.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it('opens the account menu on click, showing the identity header', async () => {
    const player = userEvent.setup();
    render(<TopBar user={user} onLogout={vi.fn()} onOpenAccountSettings={vi.fn()} notificationBell={null} />);

    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    await player.click(screen.getByRole('button', { name: 'Your account' }));

    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('calls onLogout when the Log out item is selected', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} onOpenAccountSettings={vi.fn()} notificationBell={null} />);

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    await player.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes the menu on Escape without calling onLogout', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    render(<TopBar user={user} onLogout={onLogout} onOpenAccountSettings={vi.fn()} notificationBell={null} />);

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
    render(<TopBar user={user} onLogout={vi.fn()} onOpenAccountSettings={vi.fn()} notificationBell={null} />);

    await player.click(screen.getByRole('button', { name: 'Tài khoản của bạn' }));

    expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cài đặt tài khoản' })).toBeInTheDocument();
  });

  it('calls onOpenAccountSettings (not onLogout) when Account settings is selected (ACCOUNT-1)', async () => {
    const player = userEvent.setup();
    const onLogout = vi.fn();
    const onOpenAccountSettings = vi.fn();
    render(
      <TopBar
        user={user}
        onLogout={onLogout}
        onOpenAccountSettings={onOpenAccountSettings}
        notificationBell={null}
      />,
    );

    await player.click(screen.getByRole('button', { name: 'Your account' }));
    await player.click(screen.getByRole('menuitem', { name: 'Account settings' }));

    expect(onOpenAccountSettings).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
  });
});
