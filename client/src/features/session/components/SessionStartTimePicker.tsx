import { addDays, format, startOfDay } from 'date-fns';
import { useEffect, useState } from 'react';
import { Select } from '@/shared/ui/select';
import { SessionStartTimeCalendar } from './SessionStartTimeCalendar';

interface SessionStartTimePickerProps {
  /** `"yyyy-MM-dd'T'HH:mm"` — same shape the old native `datetime-local` input produced, so
   * `CreateSessionModal`'s existing `${scheduledStart}:00` payload logic didn't need to change.
   * `''` whenever any of the three pieces (date/hour/minute) isn't set yet. */
  value: string;
  onChange: (value: string) => void;
  /** Testability seam — defaults to the real clock. */
  now?: Date;
}

const PICK_DATE_VALUE = 'pick-a-date';
const CUSTOM_DATE_VALUE = 'custom-date';
const MINUTE_STEP = 5;

/**
 * CLIENT-SESSION-2's replacement for `CreateSessionModal`'s old native `datetime-local` "Starts
 * at" input — three independent native `<select>`s (Date/Hour/Minute), not one combined
 * wheel-in-a-popover: nesting Radix floating UI (Popover, DropdownMenu) inside
 * `CreateSessionModal`'s modal Dialog caused two separate confirmed-live bugs (a stuck
 * pointer-events lock on outside-click, and a menu that silently never opened) — native
 * `<select>`s have no portal/dismissable-layer involved at all, so that whole bug class doesn't
 * apply here.
 *
 * The Date select's own options are Today/Tomorrow/the next 5 days, plus a trailing "Pick a
 * date…" that reveals `SessionStartTimeCalendar` inline (not in a popover) for anything further
 * out — there's no calendar/date-picker library in this codebase, so that's a small hand-built
 * month grid. Selecting a day from it collapses the calendar back and the chosen date shows as a
 * synthetic option in the Date select (`isCustomDate` below) since it isn't one of the 7 quick
 * choices.
 *
 * `value` is only ever non-empty once all three pieces are set. The three pieces are tracked as
 * their own local state (initialized from `value` once, on mount) rather than re-derived from
 * `value` on every change — `value` collapses back to `''` whenever a piece is still missing, so
 * re-deriving from it would discard whatever was already picked the moment the *next* piece
 * hadn't been chosen yet (confirmed the hard way: picking Date then Hour "forgot" the date,
 * because after Date-only the reported `value` was already `''` again). `commit()` updates all
 * three local pieces together and reports the combined string once complete, `''` otherwise, so
 * `CreateSessionModal`'s `scheduledStart !== ''` validity check needed no changes.
 *
 * When opened with no existing `value`, defaults to Today / one hour from now / :00 (user
 * decision) rather than starting on the blank placeholder options, and reports that default up
 * via `onChange` on mount so the parent's validity check reflects it immediately — same reasoning
 * as the Sport field's own pre-selection.
 */
export function SessionStartTimePicker({ value, onChange, now = new Date() }: SessionStartTimePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [datePart, setDatePart] = useState(() =>
    value !== '' ? value.slice(0, 10) : format(startOfDay(now), 'yyyy-MM-dd'),
  );
  const [hourPart, setHourPart] = useState(() =>
    value !== '' ? value.slice(11, 13) : String((now.getHours() + 1) % 24).padStart(2, '0'),
  );
  const [minutePart, setMinutePart] = useState(() => (value !== '' ? value.slice(14, 16) : '00'));

  useEffect(() => {
    if (value === '') onChange(`${datePart}T${hourPart}:${minutePart}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount only, to push the
    // pre-selected defaults up; not resynced if value/now change later.
  }, []);

  const floor = startOfDay(now);
  const quickDates = Array.from({ length: 7 }, (_, i) => addDays(floor, i));
  const quickDateValues = quickDates.map((date) => format(date, 'yyyy-MM-dd'));
  const isCustomDate = datePart !== '' && !quickDateValues.includes(datePart);

  const commit = (nextDate: string, nextHour: string, nextMinute: string) => {
    setDatePart(nextDate);
    setHourPart(nextHour);
    setMinutePart(nextMinute);
    onChange(
      nextDate !== '' && nextHour !== '' && nextMinute !== '' ? `${nextDate}T${nextHour}:${nextMinute}` : '',
    );
  };

  const handleDateSelect = (raw: string) => {
    if (raw === PICK_DATE_VALUE) {
      setShowCalendar(true);
      return;
    }
    setShowCalendar(false);
    commit(raw, hourPart, minutePart);
  };

  const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Select
          aria-label="Date"
          value={showCalendar ? PICK_DATE_VALUE : isCustomDate ? CUSTOM_DATE_VALUE : datePart}
          onChange={(event) => handleDateSelect(event.target.value)}
        >
          <option value="" disabled>
            Date
          </option>
          {quickDates.map((date, i) => (
            <option key={date.toISOString()} value={format(date, 'yyyy-MM-dd')}>
              {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(date, 'dd/MM')}
            </option>
          ))}
          {isCustomDate && (
            <option value={CUSTOM_DATE_VALUE}>
              {format(new Date(`${datePart}T00:00:00`), 'dd/MM/yyyy')}
            </option>
          )}
          <option value={PICK_DATE_VALUE}>Pick a date…</option>
        </Select>

        <Select
          aria-label="Hour"
          value={hourPart}
          onChange={(event) => commit(datePart, event.target.value, minutePart)}
        >
          <option value="" disabled>
            Hour
          </option>
          {hourOptions.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Minute"
          value={minutePart}
          onChange={(event) => commit(datePart, hourPart, event.target.value)}
        >
          <option value="" disabled>
            Min
          </option>
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </Select>
      </div>

      {showCalendar && (
        <div className="border-hairline rounded-lg border-border bg-surface-1 p-2.5">
          <SessionStartTimeCalendar
            value={datePart !== '' ? new Date(`${datePart}T00:00:00`) : null}
            minDate={floor}
            now={now}
            onSelect={(date) => {
              commit(format(date, 'yyyy-MM-dd'), hourPart, minutePart);
              setShowCalendar(false);
            }}
          />
          <button
            type="button"
            onClick={() => setShowCalendar(false)}
            className="mt-2 cursor-pointer rounded text-2xs text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Choose from the list instead
          </button>
        </div>
      )}
    </div>
  );
}
