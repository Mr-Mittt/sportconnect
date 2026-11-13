import { addDays, format, startOfDay } from 'date-fns';
import { useEffect, useState } from 'react';
import { Select } from '@/shared/ui/select';
import { formatDiscoverDateOptionLabel } from '../discoverDateLabel';
import { SessionStartTimeCalendar } from './SessionStartTimeCalendar';
import { useOverridableText } from '@/shared/lib/useOverridableText';

interface SessionStartTimePickerProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** `"yyyy-MM-dd'T'HH:mm"` — same shape the old native `datetime-local` input produced, so
   * `CreateSessionModal` turns it into an offset-aware ISO string on submit (`toOffsetAwareIso`).
   * `''` whenever any of the three pieces (date/hour/minute) isn't set yet. */
  value: string;
  onChange: (value: string) => void;
  /** Testability seam — defaults to the real clock. */
  now?: Date;
  /** CLIENT-SESSION-34: names this instance ("Ends at") so a second picker on the same form has its
   * own accessible names ("Ends at: date"); unset keeps the plain "Date" / "Hour" / "Minute". */
  field?: string;
  /** CLIENT-SESSION-34: `false` for the optional "Ends at" instance — it stays empty until the user
   * (or the duration) fills it, instead of pushing the "now + 1h" default up on mount. */
  prefillWhenEmpty?: boolean;
  /** CLIENT-GL-38: the start picker never offers a time earlier than now: when the date is today, the hours before the
   * current one (and, in the current hour, the minutes before the current one) are disabled. */
  disallowPast?: boolean;
}

const PICK_DATE_VALUE = 'pick-a-date';
const CUSTOM_DATE_VALUE = 'custom-date';
const MINUTE_STEP = 1;

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
export function SessionStartTimePicker({
  value,
  onChange,
  now = new Date(),
  field,
  prefillWhenEmpty = true,
  disallowPast = false,
  i18nOverridePrefix,
}: SessionStartTimePickerProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [showCalendar, setShowCalendar] = useState(false);
  // The default start is one hour from now on the hour; past 23:00 that lands on tomorrow, not on a past 00:00 today.
  const defaultStart = new Date(now);
  defaultStart.setHours(now.getHours() + 1, 0, 0, 0);
  const [datePart, setDatePart] = useState(() =>
    value !== '' ? value.slice(0, 10) : prefillWhenEmpty ? format(startOfDay(defaultStart), 'yyyy-MM-dd') : '',
  );
  const [hourPart, setHourPart] = useState(() =>
    value !== ''
      ? value.slice(11, 13)
      : prefillWhenEmpty
        ? String(defaultStart.getHours()).padStart(2, '0')
        : '',
  );
  const [minutePart, setMinutePart] = useState(() =>
    value !== '' ? value.slice(14, 16) : prefillWhenEmpty ? '00' : '',
  );
  // CLIENT-SESSION-34: `value` can now change from outside (the parent derives the end from the
  // start and the duration), so a new non-empty `value` is adopted into the three pieces — a render-
  // phase adjustment, no effect. An empty `value` is never adopted: it is also what the picker reports
  // while a piece is still missing, and re-deriving from it would discard what was already picked.
  const [adoptedValue, setAdoptedValue] = useState(value);
  if (value !== adoptedValue) {
    setAdoptedValue(value);
    if (value !== '' && value !== `${datePart}T${hourPart}:${minutePart}`) {
      setDatePart(value.slice(0, 10));
      setHourPart(value.slice(11, 13));
      setMinutePart(value.slice(14, 16));
    }
  }

  useEffect(() => {
    if (value === '' && prefillWhenEmpty) onChange(`${datePart}T${hourPart}:${minutePart}`);
    // Run once, on mount only, to push the pre-selected defaults up; not resynced if value/now change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const floor = startOfDay(now);
  const todayKey = format(floor, 'yyyy-MM-dd');
  const quickDates = Array.from({ length: 7 }, (_, i) => addDays(floor, i));
  const quickDateValues = quickDates.map((date) => format(date, 'yyyy-MM-dd'));
  const isCustomDate = datePart !== '' && !quickDateValues.includes(datePart);

  /** Minutes to jump ahead when the user lands on the current hour (so the minute is not a past :00). */
  const CURRENT_HOUR_MINUTE_LEAD = 15;

  const commit = (nextDate: string, rawHour: string, rawMinute: string) => {
    // CLIENT-GL-38: landing on today's current hour with a minute that has already passed (or none yet) sets the
    // minute to now + 15, or :59 when that would roll into the next hour, so the pick is never a past time.
    const landsOnCurrentHour =
      disallowPast && nextDate === todayKey && rawHour === String(now.getHours()).padStart(2, '0');
    const nextHour = rawHour;
    const nextMinute =
      landsOnCurrentHour && (rawMinute === '' || Number(rawMinute) < now.getMinutes())
        ? String(Math.min(now.getMinutes() + CURRENT_HOUR_MINUTE_LEAD, 59)).padStart(2, '0')
        : rawMinute;
    setDatePart(nextDate);
    setHourPart(nextHour);
    setMinutePart(nextMinute);
    onChange(
      nextDate !== '' && nextHour !== '' && nextMinute !== ''
        ? `${nextDate}T${nextHour}:${nextMinute}`
        : '',
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

  const isToday = disallowPast && datePart === todayKey;
  const isCurrentHour = isToday && hourPart === String(now.getHours()).padStart(2, '0');
  const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
    String(i * MINUTE_STEP).padStart(2, '0'),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Select
          className="min-w-0 flex-1"
          aria-label={field === undefined ? t('time.date') : t('time.dateFor', { field })}
          value={showCalendar ? PICK_DATE_VALUE : isCustomDate ? CUSTOM_DATE_VALUE : datePart}
          onChange={(event) => handleDateSelect(event.target.value)}
        >
          <option value="" disabled>
            {t('time.date')}
          </option>
          {quickDates.map((date) => {
            const dateKey = format(date, 'yyyy-MM-dd');
            return (
              <option key={date.toISOString()} value={dateKey}>
                {formatDiscoverDateOptionLabel(dateKey, todayKey)}
              </option>
            );
          })}
          {isCustomDate && (
            <option value={CUSTOM_DATE_VALUE}>
              {format(new Date(`${datePart}T00:00:00`), 'dd/MM/yyyy')}
            </option>
          )}
          <option value={PICK_DATE_VALUE}>{t('discover.date.pick')}</option>
        </Select>

        <Select
          className="w-16 shrink-0 px-2 text-center"
          aria-label={field === undefined ? t('time.hour') : t('time.hourFor', { field })}
          value={hourPart}
          onChange={(event) => commit(datePart, event.target.value, minutePart)}
        >
          <option value="" disabled>
            {t('time.hour')}
          </option>
          {hourOptions.map((hour) => (
            <option key={hour} value={hour} disabled={isToday && Number(hour) < now.getHours()}>
              {hour}
            </option>
          ))}
        </Select>

        <Select
          className="w-16 shrink-0 px-2 text-center"
          aria-label={field === undefined ? t('time.minute') : t('time.minuteFor', { field })}
          value={minutePart}
          onChange={(event) => commit(datePart, hourPart, event.target.value)}
        >
          <option value="" disabled>
            {t('time.minuteShort')}
          </option>
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute} disabled={isCurrentHour && Number(minute) < now.getMinutes()}>
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
            {t('discover.date.chooseFromList')}
          </button>
        </div>
      )}
    </div>
  );
}
