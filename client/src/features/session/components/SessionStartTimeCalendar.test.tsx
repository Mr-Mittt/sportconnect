import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionStartTimeCalendar } from './SessionStartTimeCalendar';

// 2026-08-03 is a Monday.
const now = new Date('2026-08-03T10:00:00');

describe('SessionStartTimeCalendar', () => {
  it('opens on the month containing minDate, with days before it disabled', () => {
    render(<SessionStartTimeCalendar value={null} minDate={now} now={now} onSelect={vi.fn()} />);
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Saturday, August 1, 2026')).toBeDisabled();
    expect(screen.getByLabelText('Monday, August 3, 2026')).toBeEnabled();
  });

  it('disables navigating to a month before minDate', () => {
    render(<SessionStartTimeCalendar value={null} minDate={now} now={now} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('navigates forward a month and back', async () => {
    const user = userEvent.setup();
    render(<SessionStartTimeCalendar value={null} minDate={now} now={now} onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('September 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('August 2026')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked day', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SessionStartTimeCalendar value={null} minDate={now} now={now} onSelect={onSelect} />);

    await user.click(screen.getByLabelText('Friday, August 14, 2026'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].getDate()).toBe(14);
  });

  it('marks the current value as pressed', () => {
    render(
      <SessionStartTimeCalendar
        value={new Date('2026-08-14T00:00:00')}
        minDate={now}
        now={now}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Friday, August 14, 2026')).toHaveAttribute('aria-pressed', 'true');
  });
});
