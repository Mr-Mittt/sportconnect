import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SessionStartTimePicker } from './SessionStartTimePicker';

// Fixed "now" so Today/Tomorrow/next-5-days labels and month math are deterministic —
// 2026-08-03 is a Monday.
const now = new Date('2026-08-03T10:00:00');

/** Feeds `onChange`'s result back in as `value` — picking Date, then Hour, then Minute needs each
 * select to see the previous one's result, same as the real `CreateSessionModal` parent does. */
function ControlledPicker({ onChangeSpy }: { onChangeSpy: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SessionStartTimePicker
      value={value}
      now={now}
      onChange={(next) => {
        setValue(next);
        onChangeSpy(next);
      }}
    />
  );
}

describe('SessionStartTimePicker', () => {
  it('defaults to Today / one hour from now / :00 when opened with no value, and reports that default on mount', () => {
    const onChange = vi.fn();
    render(<SessionStartTimePicker value="" onChange={onChange} now={now} />);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-08-03');
    expect(screen.getByLabelText('Hour')).toHaveValue('11');
    expect(screen.getByLabelText('Minute')).toHaveValue('00');
    expect(onChange).toHaveBeenCalledWith('2026-08-03T11:00');
  });

  it('the hour default wraps past 23 back to 00 rather than rolling into the next day', () => {
    render(<SessionStartTimePicker value="" onChange={vi.fn()} now={new Date('2026-08-03T23:30:00')} />);
    expect(screen.getByLabelText('Hour')).toHaveValue('00');
  });

  it('does not override an already-set value with the default', () => {
    const onChange = vi.fn();
    render(<SessionStartTimePicker value="2026-08-10T14:15" onChange={onChange} now={now} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Date offers Today, Tomorrow, 5 more quick days, and "Pick a date…"', () => {
    render(<SessionStartTimePicker value="" onChange={vi.fn()} now={now} />);
    const dateSelect = screen.getByLabelText('Date');
    const optionLabels = Array.from(dateSelect.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Date', 'Today', 'Tomorrow', '05/08', '06/08', '07/08', '08/08', '09/08', 'Pick a date…']);
  });

  it('reflects an existing value across all three selects', () => {
    render(<SessionStartTimePicker value="2026-08-04T19:30" onChange={vi.fn()} now={now} />);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-08-04');
    expect(screen.getByLabelText('Hour')).toHaveValue('19');
    expect(screen.getByLabelText('Minute')).toHaveValue('30');
  });

  it('changing one piece keeps the other two (defaulted) pieces, not just whichever changed', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledPicker onChangeSpy={onChangeSpy} />);
    onChangeSpy.mockClear(); // drop the mount-time default call, not what this test is about

    await user.selectOptions(screen.getByLabelText('Hour'), '19');
    expect(onChangeSpy).toHaveBeenLastCalledWith('2026-08-03T19:00');

    await user.selectOptions(screen.getByLabelText('Minute'), '30');
    expect(onChangeSpy).toHaveBeenLastCalledWith('2026-08-03T19:30');
  });

  it('changing just the hour after a full value is set keeps the existing date and minute', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SessionStartTimePicker value="2026-08-04T19:30" onChange={onChange} now={now} />);

    await user.selectOptions(screen.getByLabelText('Hour'), '09');
    expect(onChange).toHaveBeenCalledWith('2026-08-04T09:30');
  });

  it('"Pick a date…" reveals the calendar inline, and picking a day commits + collapses it back', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledPicker onChangeSpy={onChangeSpy} />);

    await user.selectOptions(screen.getByLabelText('Hour'), '19');
    await user.selectOptions(screen.getByLabelText('Minute'), '30');
    await user.selectOptions(screen.getByLabelText('Date'), 'Pick a date…');

    expect(screen.getByLabelText('Monday, August 17, 2026')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Monday, August 17, 2026'));

    expect(onChangeSpy).toHaveBeenLastCalledWith('2026-08-17T19:30');
    expect(screen.queryByLabelText('Monday, August 17, 2026')).not.toBeInTheDocument();
  });

  it('a date chosen via the calendar shows as its own option in the Date select', () => {
    render(<SessionStartTimePicker value="2026-08-20T09:00" onChange={vi.fn()} now={now} />);
    expect(screen.getByLabelText('Date')).toHaveDisplayValue('20/08/2026');
  });

  it('"Choose from the list instead" collapses the calendar without committing a date', async () => {
    const user = userEvent.setup();
    render(<SessionStartTimePicker value="" onChange={vi.fn()} now={now} />);

    await user.selectOptions(screen.getByLabelText('Date'), 'Pick a date…');
    expect(screen.getByText('Choose from the list instead')).toBeInTheDocument();
    await user.click(screen.getByText('Choose from the list instead'));

    expect(screen.queryByText('Choose from the list instead')).not.toBeInTheDocument();
  });
});
