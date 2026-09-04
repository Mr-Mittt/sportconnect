import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportProfile } from '@/shared/types/sport';
import { SportSwitcher } from './SportSwitcher';

const threeSports: SportProfile[] = [
  { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
];

describe('SportSwitcher', () => {
  it('renders the synthetic All pill first, then one pill per sport, then Add sport', () => {
    render(
      <SportSwitcher sports={threeSports} active="all" onChange={() => {}} onAddSport={() => {}} />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['All', 'Football', 'Basketball', 'Tennis', 'Add sport']);
  });

  it('clicking a sport pill calls onChange with its key; All calls onChange("all")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SportSwitcher
        sports={threeSports}
        active="basketball"
        onChange={onChange}
        onAddSport={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Football' }));
    expect(onChange).toHaveBeenCalledWith('football');
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('is controlled — the active pill follows the prop (aria-pressed), not clicks', async () => {
    const user = userEvent.setup();
    render(
      <SportSwitcher sports={threeSports} active="all" onChange={() => {}} onAddSport={() => {}} />,
    );
    await user.click(screen.getByRole('button', { name: 'Tennis' }));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tennis' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('below the cap, Add sport fires onAddSport', async () => {
    const user = userEvent.setup();
    const onAddSport = vi.fn();
    render(
      <SportSwitcher
        sports={threeSports.slice(0, 2)}
        active="all"
        onChange={() => {}}
        onAddSport={onAddSport}
      />,
    );
    const addButton = screen.getByRole('button', { name: 'Add sport' });
    expect(addButton).toHaveAttribute('aria-disabled', 'false');
    await user.click(addButton);
    expect(onAddSport).toHaveBeenCalledTimes(1);
  });

  // SPORT-5 **reverses** HF-2 here: the pill used to render aria-disabled at the cap and
  // swallow the click. That was correct about state and wrong about communication — the one
  // interaction a capped user attempts got no response beyond a hover title, invisible on
  // touch and to keyboard users. It now always fires; the caller re-reads the catalogue and
  // opens NoSportsToAddDialog when there is genuinely nothing to add.
  it('at the cap, Add sport still fires — the dialog explains, the pill no longer refuses', async () => {
    const user = userEvent.setup();
    const onAddSport = vi.fn();
    render(
      <SportSwitcher
        sports={threeSports}
        active="all"
        onChange={() => {}}
        onAddSport={onAddSport}
      />,
    );
    const addButton = screen.getByRole('button', { name: /Add sport/ });
    expect(addButton).toBeInTheDocument();
    expect(addButton).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(addButton);
    expect(onAddSport).toHaveBeenCalledTimes(1);
  });

  it('PROFILE-4: showAllPill={false} hides the All pill entirely', () => {
    render(
      <SportSwitcher
        sports={threeSports}
        active="football"
        onChange={() => {}}
        onAddSport={() => {}}
        showAllPill={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Football', 'Basketball', 'Tennis', 'Add sport']);
  });

  it('PROFILE-10: the active pill scales up 10%, an inactive one does not (until hovered)', () => {
    render(
      <SportSwitcher sports={threeSports} active="basketball" onChange={() => {}} onAddSport={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Basketball' })).toHaveClass('scale-110');
    expect(screen.getByRole('button', { name: 'Football' })).not.toHaveClass('scale-110');
    // Every pill gets the hover-scale utility, active or not — hover is a
    // separate CSS state from the isActive className branch above.
    expect(screen.getByRole('button', { name: 'Football' })).toHaveClass('hover:scale-110');
  });

  // ─── SPORT-10: deactivated sports ────────────────────────────────────────

  const inactiveSports: SportProfile[] = [
    { key: 'archery', label: 'Archery', iconUrl: null, colorRamp: 'gray' },
  ];

  it('renders inactiveSports as muted pills after the active ones, before Add sport', () => {
    render(
      <SportSwitcher
        sports={threeSports}
        active="all"
        onChange={() => {}}
        onAddSport={() => {}}
        showAllPill={false}
        inactiveSports={inactiveSports}
        onInactiveSelect={() => {}}
      />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Football', 'Basketball', 'Tennis', 'Archery', 'Add sport']);
    const archery = screen.getByRole('button', { name: 'Archery' });
    expect(archery).toHaveClass('text-text-muted');
    expect(archery).toHaveAttribute('aria-pressed', 'false'); // not the active filter here
    expect(archery).toHaveAttribute('title', 'Reactivate Archery');
  });

  it('§2e: a deactivated pill that IS the active filter shows aria-pressed + the active border', () => {
    render(
      <SportSwitcher
        sports={threeSports}
        active="archery"
        onChange={() => {}}
        onAddSport={() => {}}
        showAllPill={false}
        inactiveSports={inactiveSports}
        onInactiveSelect={() => {}}
      />,
    );
    const archery = screen.getByRole('button', { name: 'Archery' });
    expect(archery).toHaveAttribute('aria-pressed', 'true');
    expect(archery).toHaveClass('text-text-muted'); // still muted
    expect(archery).toHaveClass('border-border-accent');
  });

  it('clicking a deactivated pill calls onInactiveSelect, never onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onInactiveSelect = vi.fn();
    render(
      <SportSwitcher
        sports={threeSports}
        active="all"
        onChange={onChange}
        onAddSport={() => {}}
        showAllPill={false}
        inactiveSports={inactiveSports}
        onInactiveSelect={onInactiveSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Archery' }));
    expect(onInactiveSelect).toHaveBeenCalledWith('archery');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders no extra pills when inactiveSports is omitted (default)', () => {
    render(
      <SportSwitcher sports={threeSports} active="all" onChange={() => {}} onAddSport={() => {}} />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['All', 'Football', 'Basketball', 'Tennis', 'Add sport']);
  });

  it('is disabled and says so while the catalogue re-read is in flight', async () => {
    const user = userEvent.setup();
    const onAddSport = vi.fn();
    render(
      <SportSwitcher
        sports={threeSports}
        active="all"
        onChange={() => {}}
        onAddSport={onAddSport}
        isCheckingCatalog
      />,
    );
    const addButton = screen.getByRole('button', { name: /Checking/ });
    expect(addButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(addButton);
    // A second click must not fire a second re-read.
    expect(onAddSport).not.toHaveBeenCalled();
  });
});
