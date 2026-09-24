import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoverFeeFilter } from './DiscoverFeeFilter';

const renderFilter = (overrides: Partial<React.ComponentProps<typeof DiscoverFeeFilter>> = {}) =>
  render(
    <DiscoverFeeFilter
      feeType={undefined}
      onToggleFeeType={() => {}}
      maxFeeAmountVndText=""
      onMaxFeeAmountVndChange={() => {}}
      onClear={() => {}}
      {...overrides}
    />,
  );

describe('DiscoverFeeFilter', () => {
  it('shows bare "Fee" on the trigger when unset', () => {
    renderFilter();
    expect(screen.getByRole('button', { name: 'Fee' })).toBeInTheDocument();
  });

  // 2026-09-23 revision — the trigger shows the selected value alone once set, no "Fee " prefix.
  it('shows the chosen fee type on the trigger', () => {
    renderFilter({ feeType: 'FREE' });
    expect(screen.getByRole('button', { name: 'Free' })).toBeInTheDocument();
  });

  it('reports the toggled fee type', async () => {
    const user = userEvent.setup();
    const onToggleFeeType = vi.fn();
    renderFilter({ onToggleFeeType });

    await user.click(screen.getByRole('button', { name: 'Fee' }));
    await user.click(screen.getByRole('checkbox', { name: 'Free' }));
    expect(onToggleFeeType).toHaveBeenCalledWith('FREE');
  });

  it('checks the currently-selected fee type row', async () => {
    const user = userEvent.setup();
    renderFilter({ feeType: 'SPLIT' });

    await user.click(screen.getByRole('button', { name: 'Split cost' }));
    expect(screen.getByRole('checkbox', { name: 'Split cost' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Free' })).not.toBeChecked();
  });

  it('reports the typed max amount', async () => {
    const user = userEvent.setup();
    const onMaxFeeAmountVndChange = vi.fn();
    renderFilter({ onMaxFeeAmountVndChange });

    await user.click(screen.getByRole('button', { name: 'Fee' }));
    await user.type(screen.getByPlaceholderText('VND'), '5');
    expect(onMaxFeeAmountVndChange).toHaveBeenCalledWith('5');
  });

  it('shows a Clear button once either feeType or the amount is set', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderFilter({ feeType: 'FIXED', onClear });

    await user.click(screen.getByRole('button', { name: 'Fixed amount' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });

  // the trigger used to stay bare "Fee" whenever only the amount (not feeType) was set, giving no
  // indication anything was filtered.
  it('shows the max amount on the trigger even when feeType is unset', () => {
    renderFilter({ maxFeeAmountVndText: '500000' });
    expect(screen.getByRole('button', { name: '<=500000 VND' })).toBeInTheDocument();
  });

  it('shows both feeType and the max amount on the trigger when both are set', () => {
    renderFilter({ feeType: 'FREE', maxFeeAmountVndText: '500000' });
    expect(screen.getByRole('button', { name: 'Free, <=500000 VND' })).toBeInTheDocument();
  });

  // 2026-09-23 (second revision) — the trigger's own reset "x", separate from the in-popover
  // "Clear" button tested above.
  it('shows a reset "x" once set, reporting via onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderFilter({ feeType: 'FREE', onClear });

    await user.click(screen.getByRole('button', { name: 'Clear fee filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
