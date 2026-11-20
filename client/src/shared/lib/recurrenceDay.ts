import { format } from 'date-fns';
import i18next from 'i18next';
import { getDateFnsLocale } from '@/shared/lib/localizedDate';

/**
 * CLIENT-GROUP-SESSION-4: how a recurrence configuration's day and time read, in the active language. A weekly configuration's `dayKey` is a
 * weekday (1 to 7, Monday = 1), a monthly one's a day of the month (1 to 31). Used by the group settings' Sessions section and by the group feed's
 * system entries (`systemEntryText`), so it sits in `shared/lib` (shared code never imports from a feature).
 */

/** 2024-01-01 is a Monday, so Jan `n` is the weekday `n` for 1 to 7 and the day `n` of a month for 1 to 31. */
function referenceDate(dayKey: number): Date {
  return new Date(2024, 0, dayKey);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The weekday name for `dayKey` 1 to 7 (Monday = 1): "Monday", "Thứ Hai". */
export function weekdayName(dayKey: number): string {
  return capitalize(format(referenceDate(dayKey), 'EEEE', { locale: getDateFnsLocale() }));
}

/** The bare ordinal of a day of the month: "1st", "15th" in English, "1", "15" in Vietnamese (date-fns' `do` for the active language). */
export function monthDayOrdinal(dayKey: number): string {
  return format(referenceDate(dayKey), 'do', { locale: getDateFnsLocale() });
}

/** The label of a day group: the weekday ("Tuesday") or the day of the month ("15th", "Ngày 15"). */
export function recurrenceDayLabel(mode: string, dayKey: number): string {
  return mode === 'MONTHLY'
    ? i18next.t('groups:settings.sessions.monthDay', { ordinal: monthDayOrdinal(dayKey) })
    : weekdayName(dayKey);
}

/** `HH:mm` from the server's `HH:mm:ss` (a wall-clock time, shown as it is, never converted). */
export function clockTime(startTime: string): string {
  return startTime.slice(0, 5);
}

/** The wall-clock end (`HH:mm`) of a slot, or null without a duration; past midnight it wraps to the next day's clock. */
export function clockEndTime(startTime: string, durationMinutes: number | null): string | null {
  if (durationMinutes === null) return null;
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
