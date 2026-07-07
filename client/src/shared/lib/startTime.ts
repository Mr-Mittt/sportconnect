import { differenceInCalendarDays, format } from 'date-fns';

/**
 * Formats a future ISO timestamp the way the mockup labels upcoming matches:
 * "Today, 7:00 PM", "Tomorrow, 7:00 PM", weekday within a week ("Wed, 6:30 PM"),
 * then date beyond that ("Jul 14, 6:30 PM"). Counterpart of formatRelativeTime,
 * which only handles the past. Calendar-day based, so 11 PM → 1 AM still says
 * "Tomorrow" rather than "Today".
 */
export function formatStartTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = differenceInCalendarDays(date, now);
  if (days === 0) {
    return `Today, ${format(date, 'h:mm a')}`;
  }
  if (days === 1) {
    return `Tomorrow, ${format(date, 'h:mm a')}`;
  }
  if (days > 1 && days < 7) {
    return format(date, 'EEE, h:mm a');
  }
  return format(date, 'MMM d, h:mm a');
}
