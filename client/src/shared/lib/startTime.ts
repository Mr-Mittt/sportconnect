import { differenceInCalendarDays, format, isSameDay } from 'date-fns';

/**
 * Formats a future ISO timestamp the way the mockup labels upcoming matches:
 * "Today, 19:00", "Tomorrow, 19:00", weekday within a week ("Wed, 18:30"),
 * then date beyond that ("Jul 14, 18:30"). Counterpart of formatRelativeTime,
 * which only handles the past. Calendar-day based, so 23:00 → 01:00 still says
 * "Tomorrow" rather than "Today". CLIENT-SESSION-30: 24-hour clock (was 12-hour).
 */
export function formatStartTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = differenceInCalendarDays(date, now);
  if (days === 0) {
    return `Today, ${format(date, 'HH:mm')}`;
  }
  if (days === 1) {
    return `Tomorrow, ${format(date, 'HH:mm')}`;
  }
  if (days > 1 && days < 7) {
    return format(date, 'EEE, HH:mm');
  }
  return format(date, 'MMM d, HH:mm');
}

/**
 * CLIENT-SESSION-30: a session card's time line — `formatStartTime` for the start, then
 * " – " and the end. Same calendar day as the start → just the end's clock time
 * ("Today, 15:00 – 17:00"); a different day → the end date too ("Today, 22:00 – Sep 25, 01:00"), so
 * an overnight session is never misread. No end time (`scheduledEndAt` is null) → the start only.
 * Both ends render in the viewer's zone, like the start always has.
 */
export function formatSessionTimeRange(
  startIso: string,
  endIso: string | null,
  now: Date = new Date(),
): string {
  const start = formatStartTime(startIso, now);
  if (endIso === null) return start;
  const endDate = new Date(endIso);
  const end = isSameDay(new Date(startIso), endDate) ? format(endDate, 'HH:mm') : format(endDate, 'MMM d, HH:mm');
  return `${start} – ${end}`;
}

/**
 * CLIENT-SESSION-10: `SessionDetailModal`'s header status row — always "EEE, MMM d · HH:mm"
 * ("Sun, Aug 16 · 18:00"), per design-reference-session-modal.html. Deliberately distinct from
 * `formatStartTime` above: the header is a persistent, single display a user reads once and takes
 * in fully, so it always shows the full weekday + date rather than `formatStartTime`'s
 * relative-shorthand ("Today"/"Tomorrow"/weekday-only) built for compact, frequently-rescanned
 * card rows.
 *
 * CLIENT-SESSION-30: 24-hour clock, plus an optional end — same day → "Sun, Aug 16 · 18:00 – 20:00",
 * a different day → the end's weekday/date too ("Sun, Aug 16 · 22:00 – Mon, Aug 17 · 01:00"); a null
 * or omitted end shows the start only.
 */
export function formatSessionHeaderDateTime(iso: string, endIso: string | null = null): string {
  const start = new Date(iso);
  const startLabel = format(start, "EEE, MMM d '·' HH:mm");
  if (endIso === null) return startLabel;
  const end = new Date(endIso);
  return `${startLabel} – ${isSameDay(start, end) ? format(end, 'HH:mm') : format(end, "EEE, MMM d '·' HH:mm")}`;
}
