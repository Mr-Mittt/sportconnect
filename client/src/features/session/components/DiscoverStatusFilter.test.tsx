import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoverStatusFilter } from './DiscoverStatusFilter';

const renderFilter = (overrides: Partial<React.ComponentProps<typeof DiscoverStatusFilter>> = {}) =>
  render(<DiscoverStatusFilter selectedStatuses={[]} onToggleStatus={() => {}} {...overrides} />);

describe('DiscoverStatusFilter', () => {
  it('offers only Preparing/Scheduled, never Ongoing/Completed/Cancelled', async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.getByRole('checkbox', { name: 'Preparing' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ongoing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Cancelled' })).not.toBeInTheDocument();
  });

  it('reports the toggled status', async () => {
    const user = userEvent.setup();
    const onToggleStatus = vi.fn();
    renderFilter({ onToggleStatus });

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('checkbox', { name: 'Preparing' }));
    expect(onToggleStatus).toHaveBeenCalledWith('PREPARING');
  });

  // Single-select: the trigger shows the one selected status's own label, not a count, since
  // `selectedStatuses` only ever holds 0 or 1 entries. Revised same day to drop the "Status "
  // prefix too — the trigger shows the value alone once set.
  it('shows the selected status on the trigger and checks its row', async () => {
    const user = userEvent.setup();
    renderFilter({ selectedStatuses: ['SCHEDULED'] });

    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByRole('checkbox', { name: 'Preparing' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Scheduled' })).toBeChecked();
  });

  // 2026-09-23 (second revision) — the reset "x" reuses toggleStatus on the selected value
  // itself (the hook's own mutual-exclusion toggle already clears back to "both" that way).
  it('shows a reset "x" once set, clearing via onToggleStatus on the selected status', async () => {
    const user = userEvent.setup();
    const onToggleStatus = vi.fn();
    renderFilter({ selectedStatuses: ['PREPARING'], onToggleStatus });

    await user.click(screen.getByRole('button', { name: 'Clear status filter' }));
    expect(onToggleStatus).toHaveBeenCalledWith('PREPARING');
  });
});
