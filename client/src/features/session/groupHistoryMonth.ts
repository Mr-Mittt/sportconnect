import { addMonths, differenceInCalendarDays, format, parse, subDays } from 'date-fns';
import { formatLocalized } from '@/shared/lib/localizedDate';

const DAY = 'yyyy-MM-dd';
const MONTH = 'yyyy-MM';

/** The month's name in the active language, "October 2026" / "tháng 10, 2026". */
export function formatHistoryMonth(month: string): string {
  return formatLocalized(parse(`${month}-01`, DAY, new Date()), 'monthYear');
}

/** `yyyy-MM` of a `yyyy-MM-dd` day or of any date, in the viewer's local calendar (the zone every history call sends). */
export function monthOf(day: string | Date): string {
  return format(typeof day === 'string' ? parse(day, DAY, new Date()) : day, MONTH);
}

/**
 * CLIENT-GROUP-UI-1: the month the group History opens on, the month of **yesterday** (so on the 1st of a month it is the
 * previous month, and on 1 January it is December). The current month is never offered before it has a finished day.
 */
export function defaultHistoryMonth(today: Date): string {
  return monthOf(subDays(today, 1));
}

/** The month `delta` months from `month` (`yyyy-MM`). */
export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parse(`${month}-01`, DAY, new Date()), delta), MONTH);
}

/**
 * The earliest month the History can show: the month the group was created in, or `null` when `createdAt` cannot be read (no
 * lower bound then). A group has no finished session before it existed.
 */
export function earliestHistoryMonth(createdAt: string | undefined): string | null {
  if (createdAt === undefined) return null;
  const created = new Date(createdAt);
  return Number.isNaN(created.getTime()) ? null : monthOf(created);
}

/** The month's request window for `GET .../history/dates`, or `null` when no day of it has ended yet. */
export interface HistoryMonthWindow {
  /** `yyyy-MM-dd`, the call's `before`: the window ends the day before it. */
  before: string;
  /** The call's `days`: the days from the first of the month up to `before` (at most 31, the server allows 90). */
  days: number;
  /** The month's days that can hold a finished session (the first through the day before `before`), newest first. */
  daysNewestFirst: string[];
}

/**
 * The one window that holds `month`'s past days: it ends the day before the first of the next month, or the day before `today`
 * for the current month, and starts on the first of the month. `today` is `yyyy-MM-dd` in the viewer's zone. A month with no
 * past day (the current month on its 1st, a future month) has no window: nothing is asked.
 */
export function historyMonthWindow(month: string, today: string): HistoryMonthWindow | null {
  const first = parse(`${month}-01`, DAY, new Date());
  const firstOfNext = addMonths(first, 1);
  const todayDate = parse(today, DAY, new Date());
  const end = firstOfNext.getTime() < todayDate.getTime() ? firstOfNext : todayDate;
  const days = differenceInCalendarDays(end, first);
  if (days <= 0) return null;
  const daysNewestFirst: string[] = [];
  for (let offset = 1; offset <= days; offset += 1) daysNewestFirst.push(format(subDays(end, offset), DAY));
  return { before: format(end, DAY), days, daysNewestFirst };
}
