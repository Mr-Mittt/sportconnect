import i18next from 'i18next';
import { formatLocalized } from '@/shared/lib/localizedDate';
import { formatRelativeTime } from '@/shared/lib/relativeTime';

/** CLIENT-GL-51: a post or comment older than this many days shows its date instead of "Nd ago". */
export const RELATIVE_TIMESTAMP_DAYS = 7;

/**
 * The timestamp of a post, comment or reply: "3d ago" while it is at most a week old, then its date ("Nov 3"),
 * with the year ("Nov 3, 2025") only when it is not the current year.
 */
export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (now.getTime() - date.getTime() <= RELATIVE_TIMESTAMP_DAYS * 86_400_000) return formatRelativeTime(iso, now);
  return formatLocalized(date, date.getFullYear() === now.getFullYear() ? 'monthDay' : 'dayMonthYear');
}

/** The full date and time, for a timestamp's hover, in the active language. */
export function formatFullDateTime(iso: string): string {
  return new Intl.DateTimeFormat(i18next.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
