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

  it('at the cap, Add sport stays visible but is aria-disabled and does not fire', async () => {
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
    expect(addButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(addButton);
    expect(onAddSport).not.toHaveBeenCalled();
  });
});
