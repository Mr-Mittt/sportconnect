import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatHistoryMonth } from '@/features/session/groupHistoryMonth';
import { HistoryMonthFilter } from './HistoryMonthFilter';

/** CLIENT-GROUP-UI-1: the month filter in the History header. */
function renderFilter(overrides: Partial<React.ComponentProps<typeof HistoryMonthFilter>> = {}) {
  const props = { month: '2026-11', canGoPrevious: true, canGoNext: true, onPrevious: vi.fn(), onNext: vi.fn(), ...overrides };
  render(<HistoryMonthFilter {...props} />);
  return props;
}

describe('HistoryMonthFilter', () => {
  it('shows the month by its name between a previous and a next arrow, in one labelled group', () => {
    renderFilter();
    expect(screen.getByRole('group', { name: 'Month of the history' })).toBeInTheDocument();
    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
  });

  it('calls back for each arrow', async () => {
    const props = renderFilter();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('disables an arrow at its limit and does not call back', async () => {
    const props = renderFilter({ canGoPrevious: false, canGoNext: false });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(props.onPrevious).not.toHaveBeenCalled();
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it('names a month of another year with its year', () => {
    expect(formatHistoryMonth('2025-12')).toBe('December 2025');
  });
});
