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

  it('the default past 23:00 is tomorrow at 00:00, never a 00:00 that has already passed today', () => {
    const onChange = vi.fn();
    render(<SessionStartTimePicker value="" onChange={onChange} now={new Date('2026-08-03T23:30:00')} />);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-08-04');
    expect(screen.getByLabelText('Hour')).toHaveValue('00');
    expect(onChange).toHaveBeenCalledWith('2026-08-04T00:00');
  });

  describe('disallowPast (the start picker)', () => {
    const optionState = (select: HTMLElement) =>
      Array.from(select.querySelectorAll('option')).filter((option) => option.value !== '').map((option) => [option.value, option.disabled] as const);

    it('disables the hours before the current one when the date is today', () => {
      render(<SessionStartTimePicker value="2026-08-03T14:30" onChange={vi.fn()} now={now} disallowPast />);
      const hours = optionState(screen.getByLabelText('Hour'));
      expect(hours.filter(([, disabled]) => disabled).map(([hour]) => hour)).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']);
      expect(hours.find(([hour]) => hour === '10')?.[1]).toBe(false);
    });

    it('in the current hour also disables the minutes before the current one', () => {
      render(<SessionStartTimePicker value="2026-08-03T10:30" onChange={vi.fn()} now={new Date('2026-08-03T10:15:40')} disallowPast />);
      const minutes = optionState(screen.getByLabelText('Minute'));
      expect(minutes.filter(([, disabled]) => disabled).map(([minute]) => minute)).toEqual(Array.from({ length: 15 }, (_, i) => String(i).padStart(2, '0')));
    });

    function Controlled({ start, at, disallowPast = true }: { start: string; at: Date; disallowPast?: boolean }) {
      const [value, setValue] = useState(start);
      return <SessionStartTimePicker value={value} onChange={setValue} now={at} disallowPast={disallowPast} />;
    }

    it('landing on the current hour with a past :00 sets the minute to now + 15', async () => {
      const user = userEvent.setup();
      render(<Controlled start="2026-08-03T14:00" at={new Date('2026-08-03T10:10:40')} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '10');
      expect(screen.getByLabelText('Minute')).toHaveValue('25');
    });

    it('uses :59 when now + 15 would roll into the next hour', async () => {
      const user = userEvent.setup();
      render(<Controlled start="2026-08-03T14:00" at={new Date('2026-08-03T10:50:00')} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '10');
      expect(screen.getByLabelText('Minute')).toHaveValue('59');
    });

    it('keeps a minute that is not in the past, and leaves other hours and days alone', async () => {
      const user = userEvent.setup();
      render(<Controlled start="2026-08-03T14:40" at={new Date('2026-08-03T10:10:00')} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '10');
      expect(screen.getByLabelText('Minute')).toHaveValue('40');
      await user.selectOptions(screen.getByLabelText('Hour'), '12');
      expect(screen.getByLabelText('Minute')).toHaveValue('40');
    });

    it('does not touch the minute for a later day or without disallowPast', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Controlled start="2026-08-04T14:00" at={new Date('2026-08-03T10:10:00')} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '10');
      expect(screen.getByLabelText('Minute')).toHaveValue('00');
      unmount();
      render(<Controlled start="2026-08-03T14:00" at={new Date('2026-08-03T10:10:00')} disallowPast={false} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '10');
      expect(screen.getByLabelText('Minute')).toHaveValue('00');
    });

    it('switching the date to today while the hour is the current one also moves a past minute', async () => {
      const user = userEvent.setup();
      render(<Controlled start="2026-08-04T10:00" at={new Date('2026-08-03T10:10:00')} />);
      await user.selectOptions(screen.getByLabelText('Date'), 'Today');
      expect(screen.getByLabelText('Minute')).toHaveValue('25');
    });

    it('disables nothing on a later day, nor without the prop', () => {
      const { unmount } = render(<SessionStartTimePicker value="2026-08-04T01:00" onChange={vi.fn()} now={now} disallowPast />);
      expect(optionState(screen.getByLabelText('Hour')).some(([, disabled]) => disabled)).toBe(false);
      unmount();
      render(<SessionStartTimePicker value="2026-08-03T14:30" onChange={vi.fn()} now={now} />);
      expect(optionState(screen.getByLabelText('Hour')).some(([, disabled]) => disabled)).toBe(false);
    });
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
    expect(optionLabels).toEqual([
      'Date',
      'Today',
      'Tomorrow (4th Aug)',
      'Wed, 5th Aug',
      'Thu, 6th Aug',
      'Fri, 7th Aug',
      'Sat, 8th Aug',
      'Sun, 9th Aug',
      'Pick a date…',
    ]);
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

  describe('CLIENT-SESSION-34: one-minute steps, narrow selects, follows value, end variant', () => {
    it('offers every minute from 00 to 59', () => {
      render(<SessionStartTimePicker value="2026-08-04T19:07" onChange={vi.fn()} now={now} />);
      const options = Array.from(screen.getByLabelText('Minute').querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toHaveLength(61);
      expect(options.slice(1, 4)).toEqual(['00', '01', '02']);
      expect(options[60]).toBe('59');
      expect(screen.getByLabelText('Minute')).toHaveValue('07');
    });

    it('keeps the hour and minute selects narrow (two characters wide) and lets the date take the rest', () => {
      render(<SessionStartTimePicker value="2026-08-04T19:07" onChange={vi.fn()} now={now} />);
      expect(screen.getByLabelText('Hour').className).toContain('w-16');
      expect(screen.getByLabelText('Minute').className).toContain('w-16');
      expect(screen.getByLabelText('Date').className).toContain('flex-1');
    });

    it('adopts a new non-empty value passed from outside (the end follows the start and duration)', () => {
      const { rerender } = render(<SessionStartTimePicker value="2026-08-04T19:00" onChange={vi.fn()} now={now} />);
      rerender(<SessionStartTimePicker value="2026-08-05T21:45" onChange={vi.fn()} now={now} />);
      expect(screen.getByLabelText('Date')).toHaveValue('2026-08-05');
      expect(screen.getByLabelText('Hour')).toHaveValue('21');
      expect(screen.getByLabelText('Minute')).toHaveValue('45');
    });

    it('an empty value from outside does not wipe what was already picked', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<SessionStartTimePicker value="" prefillWhenEmpty={false} onChange={vi.fn()} now={now} />);
      await user.selectOptions(screen.getByLabelText('Hour'), '19');
      rerender(<SessionStartTimePicker value="" prefillWhenEmpty={false} onChange={vi.fn()} now={now} />);
      expect(screen.getByLabelText('Hour')).toHaveValue('19');
    });

    it('prefillWhenEmpty={false} starts empty and reports nothing on mount', () => {
      const onChange = vi.fn();
      render(<SessionStartTimePicker value="" prefillWhenEmpty={false} onChange={onChange} now={now} />);
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Date')).toHaveValue('');
      expect(screen.getByLabelText('Hour')).toHaveValue('');
      expect(screen.getByLabelText('Minute')).toHaveValue('');
    });

    it('reports a value only once the date, hour and minute are all picked (end variant)', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SessionStartTimePicker value="" prefillWhenEmpty={false} onChange={onChange} now={now} />);
      await user.selectOptions(screen.getByLabelText('Date'), 'Today');
      await user.selectOptions(screen.getByLabelText('Hour'), '21');
      expect(onChange).toHaveBeenLastCalledWith('');
      await user.selectOptions(screen.getByLabelText('Minute'), '15');
      expect(onChange).toHaveBeenLastCalledWith('2026-08-03T21:15');
    });

    it('a named instance gets its own accessible names so two pickers on one form do not clash', () => {
      render(<SessionStartTimePicker field="Ends at" value="" prefillWhenEmpty={false} onChange={vi.fn()} now={now} />);
      expect(screen.getByLabelText('Ends at: date')).toBeInTheDocument();
      expect(screen.getByLabelText('Ends at: hour')).toBeInTheDocument();
      expect(screen.getByLabelText('Ends at: minute')).toBeInTheDocument();
      expect(screen.queryByLabelText('Hour')).not.toBeInTheDocument();
    });
  });
});
