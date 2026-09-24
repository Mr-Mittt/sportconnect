import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoverOpenSlotsFilter } from './DiscoverOpenSlotsFilter';

const renderFilter = (
  overrides: Partial<React.ComponentProps<typeof DiscoverOpenSlotsFilter>> = {},
) =>
  render(
    <DiscoverOpenSlotsFilter value="" onChange={() => {}} onClear={() => {}} {...overrides} />,
  );

// 2026-09-23 revision — direct inline input, no Popover: this is now the filter with exactly one
// control, so the input is always visible rather than hidden behind a trigger button.
describe('DiscoverOpenSlotsFilter', () => {
  it('shows an "Open slots" placeholder and no Clear button when unset', () => {
    renderFilter();
    expect(screen.getByPlaceholderText('Open slots')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear open slots filter' })).not.toBeInTheDocument();
  });

  it('reports the typed value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter({ onChange });

    await user.type(screen.getByLabelText('Minimum open slots'), '2');
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('shows a Clear button once set, and reports clearing', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderFilter({ value: '3', onClear });

    expect(screen.getByLabelText('Minimum open slots')).toHaveValue(3);
    await user.click(screen.getByRole('button', { name: 'Clear open slots filter' }));
    expect(onClear).toHaveBeenCalled();
  });

  // Second revision, same day — "only number input, no (-) input": onChange strips every
  // non-digit character, not just '-'.
  it('strips non-digit characters (including "-") as they are typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter({ onChange });

    await user.type(screen.getByLabelText('Minimum open slots'), '-5');
    // Each keystroke fires its own onChange against the still-empty controlled `value` (this
    // component doesn't own local state) — '-' sanitizes to '', '5' sanitizes to '5'.
    expect(onChange).toHaveBeenLastCalledWith('5');
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('-'));
  });

  it('re-clamps an out-of-range value into 1..999 on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter({ value: '1500', onChange });

    await user.click(screen.getByLabelText('Minimum open slots'));
    await user.tab();
    expect(onChange).toHaveBeenCalledWith('999');
  });

  it('clamps a below-minimum value up to 1 on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter({ value: '0', onChange });

    await user.click(screen.getByLabelText('Minimum open slots'));
    await user.tab();
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('leaves an empty value alone on blur (still means "no filter")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderFilter({ value: '', onChange });

    await user.click(screen.getByLabelText('Minimum open slots'));
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  // Third revision, same day — hand-drawn increment/decrement buttons replace the native number
  // spinner (whose own background can't be recolored to match the active pill in Chromium).
  describe('increment/decrement buttons', () => {
    it('increases the value by 1, clamped at 999', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilter({ value: '999', onChange });

      await user.click(screen.getByRole('button', { name: 'Increase open slots' }));
      expect(onChange).toHaveBeenCalledWith('999');
    });

    it('decreases the value by 1, clamped at 1', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilter({ value: '1', onChange });

      await user.click(screen.getByRole('button', { name: 'Decrease open slots' }));
      expect(onChange).toHaveBeenCalledWith('1');
    });

    it('starts from the minimum when stepping from empty, either direction', async () => {
      const user = userEvent.setup();
      const onChangeUp = vi.fn();
      const { unmount } = renderFilter({ value: '', onChange: onChangeUp });
      await user.click(screen.getByRole('button', { name: 'Increase open slots' }));
      expect(onChangeUp).toHaveBeenCalledWith('1');
      unmount();

      const onChangeDown = vi.fn();
      renderFilter({ value: '', onChange: onChangeDown });
      await user.click(screen.getByRole('button', { name: 'Decrease open slots' }));
      expect(onChangeDown).toHaveBeenCalledWith('1');
    });

    it('steps a normal value by 1 in each direction', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderFilter({ value: '5', onChange });

      await user.click(screen.getByRole('button', { name: 'Increase open slots' }));
      expect(onChange).toHaveBeenCalledWith('6');
      await user.click(screen.getByRole('button', { name: 'Decrease open slots' }));
      expect(onChange).toHaveBeenCalledWith('4');
    });
  });
});
