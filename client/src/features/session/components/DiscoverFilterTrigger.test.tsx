import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Popover } from '@/shared/ui/popover';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';

const renderTrigger = (overrides: Partial<React.ComponentProps<typeof DiscoverFilterTrigger>> = {}) =>
  render(
    <Popover>
      <DiscoverFilterTrigger
        label="Status"
        isActive={false}
        onClear={() => {}}
        clearLabel="Clear status filter"
        {...overrides}
      />
    </Popover>,
  );

describe('DiscoverFilterTrigger', () => {
  it('renders only the label trigger, no reset "x", when inactive', () => {
    renderTrigger();
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear status filter' })).not.toBeInTheDocument();
  });

  it('renders a reset "x" alongside the trigger when active', () => {
    renderTrigger({ isActive: true, label: 'Preparing' });
    expect(screen.getByRole('button', { name: 'Preparing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear status filter' })).toBeInTheDocument();
  });

  it('reports clicking the reset "x" via onClear, independent of the trigger button', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderTrigger({ isActive: true, onClear });

    await user.click(screen.getByRole('button', { name: 'Clear status filter' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
