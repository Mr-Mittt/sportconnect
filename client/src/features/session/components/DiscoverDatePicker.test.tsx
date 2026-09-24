import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoverDatePicker } from './DiscoverDatePicker';

const quickDates = ['2026-08-01', '2026-08-02', '2026-08-03'];
const dateOptionLabel = (date: string) =>
  date === '2026-08-01' ? 'Today' : date === '2026-08-02' ? 'Tomorrow' : date;
const dateLabel = (date: string) =>
  date === '2026-08-01' ? 'Today' : date === '2026-08-02' ? 'Tomorrow' : date;

const renderPicker = (overrides: Partial<React.ComponentProps<typeof DiscoverDatePicker>> = {}) =>
  render(
    <DiscoverDatePicker
      quickDates={quickDates}
      selectedDates={['2026-08-01']}
      onToggleDate={() => {}}
      dateOptionLabel={dateOptionLabel}
      dateLabel={dateLabel}
      isAtMax={false}
      isActive={false}
      onReset={() => {}}
      {...overrides}
    />,
  );

describe('DiscoverDatePicker', () => {
  it('shows the checklist with the selected date(s) checked', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('checkbox', { name: 'Today' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tomorrow' })).not.toBeChecked();
  });

  it('reports the toggled date', async () => {
    const user = userEvent.setup();
    const onToggleDate = vi.fn();
    renderPicker({ onToggleDate });

    await user.click(screen.getByRole('button', { name: 'Today' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tomorrow' }));
    expect(onToggleDate).toHaveBeenCalledWith('2026-08-02');
  });

  it('shows plain "Date" when nothing is selected', () => {
    renderPicker({ selectedDates: [] });
    expect(screen.getByRole('button', { name: 'Date' })).toBeInTheDocument();
  });

  it('labels the trigger with the date itself once exactly one is selected', () => {
    renderPicker({ selectedDates: ['2026-08-01'] });
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('shows a selection count once more than one date is checked', () => {
    renderPicker({ selectedDates: ['2026-08-01', '2026-08-02'] });
    expect(screen.getByRole('button', { name: 'Date (2)' })).toBeInTheDocument();
  });

  // 2026-09-23 revision — the reset "x" only renders once active, and reports via onReset.
  it('shows a reset "x" only when active, reporting via onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const { rerender } = renderPicker({ isActive: false });
    expect(screen.queryByRole('button', { name: 'Reset date filter' })).not.toBeInTheDocument();

    rerender(
      <DiscoverDatePicker
        quickDates={quickDates}
        selectedDates={['2026-08-01']}
        onToggleDate={() => {}}
        dateOptionLabel={dateOptionLabel}
        dateLabel={dateLabel}
        isAtMax={false}
        isActive
        onReset={onReset}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Reset date filter' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disables unchecked options and hides "Pick a date…" once at the cap', async () => {
    const user = userEvent.setup();
    renderPicker({ isAtMax: true });

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('checkbox', { name: 'Tomorrow' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Today' })).not.toBeDisabled(); // already checked
    expect(screen.getByRole('button', { name: 'Pick a date…' })).toBeDisabled();
  });

  it('reveals the calendar and reports a picked custom date', async () => {
    const user = userEvent.setup();
    const onToggleDate = vi.fn();
    renderPicker({ onToggleDate });

    await user.click(screen.getByRole('button', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: 'Pick a date…' }));
    expect(screen.getByRole('button', { name: 'Choose from the list instead' })).toBeInTheDocument();

    // Pick a day later in the currently-shown month (any enabled day cell works for this check).
    const dayButtons = screen.getAllByRole('button', { name: /^\w+, \w+ \d+, \d{4}$/ });
    const enabledDay = dayButtons.find((button) => !button.hasAttribute('disabled'));
    await user.click(enabledDay!);
    expect(onToggleDate).toHaveBeenCalledTimes(1);
  });
});
