import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscoverTimeFilter } from './DiscoverTimeFilter';

afterEach(() => {
  // Safety net: userEvent's internal delays hang forever under fake timers (see the
  // fireEvent-based workaround below), so a test that throws before its own
  // vi.useRealTimers() call would otherwise leak fake timers into every later test in this file.
  vi.useRealTimers();
});

const renderFilter = (overrides: Partial<React.ComponentProps<typeof DiscoverTimeFilter>> = {}) =>
  render(
    <DiscoverTimeFilter
      startTimeFilter={undefined}
      onStartTimeFilterChange={() => {}}
      startTime={undefined}
      onStartTimeChange={() => {}}
      onClear={() => {}}
      {...overrides}
    />,
  );

/** Opens the popover — every control below lives inside it, same as `DiscoverDatePicker`'s own
 * "click the trigger first" test pattern (Radix `Popover` doesn't mount its content until open). */
async function openPopover(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp | string = /^(Time|Before|After)/) {
  await user.click(screen.getByRole('button', { name: triggerName }));
}

describe('DiscoverTimeFilter', () => {
  it('shows the plain "Time" trigger label when unset', () => {
    renderFilter();
    expect(screen.getByRole('button', { name: 'Time' })).toBeInTheDocument();
  });

  // 2026-09-23 revision — "Start before/after …" shortened to "Before/After …".
  it('shows "<Direction> <time>" on the trigger once set', () => {
    renderFilter({ startTimeFilter: 'BEFORE_OR_EQUAL', startTime: '18:00' });
    expect(screen.getByRole('button', { name: 'Before 18:00' })).toBeInTheDocument();
  });

  it('pre-fills hour/minute with the current time when opened with no filter set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T09:05:00'));
    renderFilter();

    // fireEvent, not userEvent: userEvent's internal delays are real setTimeout calls that
    // never resolve under fake timers, hanging the test (see the file-level afterEach note).
    fireEvent.click(screen.getByRole('button', { name: 'Time' }));
    expect(screen.getByRole('spinbutton', { name: 'Hour' })).toHaveValue(9);
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveValue(5);
    vi.useRealTimers();
  });

  it('shows the existing startTime in the hour/minute inputs when already set', async () => {
    const user = userEvent.setup();
    renderFilter({ startTimeFilter: 'AFTER_OR_EQUAL', startTime: '18:30' });

    await openPopover(user);
    expect(screen.getByRole('spinbutton', { name: 'Hour' })).toHaveValue(18);
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveValue(30);
  });

  it('clicking "After" turns the filter on using the current hour/minute values', async () => {
    const user = userEvent.setup();
    const onStartTimeFilterChange = vi.fn();
    const onStartTimeChange = vi.fn();
    renderFilter({ onStartTimeFilterChange, onStartTimeChange });

    await openPopover(user, 'Time');
    const hourInput = screen.getByRole('spinbutton', { name: 'Hour' });
    await user.clear(hourInput);
    await user.type(hourInput, '18');
    await user.tab(); // commit on blur

    const minuteInput = screen.getByRole('spinbutton', { name: 'Minute' });
    await user.clear(minuteInput);
    await user.type(minuteInput, '00');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(onStartTimeFilterChange).toHaveBeenCalledWith('AFTER_OR_EQUAL');
    expect(onStartTimeChange).toHaveBeenCalledWith('18:00');
  });

  it('clicking the already-active direction clears the filter entirely', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderFilter({ startTimeFilter: 'BEFORE_OR_EQUAL', startTime: '18:00', onClear });

    await openPopover(user);
    await user.click(screen.getByRole('button', { name: 'Before' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  // 2026-09-23 (second revision) — the trigger's own reset "x", separate from the in-popover
  // Before/After toggle-off behavior tested above.
  it('shows a reset "x" once set, reporting via onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderFilter({ startTimeFilter: 'AFTER_OR_EQUAL', startTime: '09:00', onClear });

    await user.click(screen.getByRole('button', { name: 'Clear time filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('editing the hour while a direction is already active updates startTime immediately', async () => {
    const user = userEvent.setup();
    const onStartTimeChange = vi.fn();
    renderFilter({ startTimeFilter: 'AFTER_OR_EQUAL', startTime: '18:00', onStartTimeChange });

    await openPopover(user);
    const hourInput = screen.getByRole('spinbutton', { name: 'Hour' });
    await user.clear(hourInput);
    await user.type(hourInput, '20');
    await user.tab();

    expect(onStartTimeChange).toHaveBeenCalledWith('20:00');
  });

  it('clamps an out-of-range hour/minute to the valid 24h window on blur', async () => {
    const user = userEvent.setup();
    renderFilter();

    await openPopover(user, 'Time');
    const hourInput = screen.getByRole('spinbutton', { name: 'Hour' });
    await user.clear(hourInput);
    await user.type(hourInput, '99');
    await user.tab();
    expect(hourInput).toHaveValue(23);

    const minuteInput = screen.getByRole('spinbutton', { name: 'Minute' });
    await user.clear(minuteInput);
    await user.type(minuteInput, '99');
    await user.tab();
    expect(minuteInput).toHaveValue(59);
  });

  it('marks the active direction button aria-pressed', async () => {
    const user = userEvent.setup();
    renderFilter({ startTimeFilter: 'AFTER_OR_EQUAL', startTime: '09:00' });

    await openPopover(user);
    expect(screen.getByRole('button', { name: 'After' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Before' })).toHaveAttribute('aria-pressed', 'false');
  });
});
