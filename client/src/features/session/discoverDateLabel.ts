import { addDays, format, startOfDay } from 'date-fns';

/** SESSION-39's own cap on how many explicit `date` values `/discover/counts` accepts in one
 * call — also this feature's cap on how many dates a caller can check in the Date filter at once. */
export const MAX_DISCOVER_DATES = 8;

/** Same "Today"/"Tomorrow"/`dd/MM` labeling `SessionStartTimePicker`'s quick-date `<select>`
 * already uses for session scheduling, reused here for the Date filter's checklist and each
 * expanded section's own header — one place these three labels stay consistent. `today` is
 * `yyyy-MM-dd`, matching every other date-keyed value in this feature. */
export function formatDiscoverDateLabel(dateKey: string, today: string): string {
  if (dateKey === today) return 'Today';
  const tomorrow = format(addDays(new Date(`${today}T00:00:00`), 1), 'yyyy-MM-dd');
  if (dateKey === tomorrow) return 'Tomorrow';
  return format(new Date(`${dateKey}T00:00:00`), 'dd/MM');
}

/** `DiscoverDatePicker`'s own checklist-row label — same as `formatDiscoverDateLabel` except
 * "Tomorrow" also carries its actual date (`Tomorrow (dd/MM)`), since unlike "Today" it isn't
 * self-evident which calendar date it is while scanning a list of checkboxes (CLIENT-SESSION-22
 * delta, 2026-09-22). Section headers keep the bare `formatDiscoverDateLabel` — repeating the date
 * next to an already-expanded section's own sessions (which show their own dates) is redundant
 * there. */
export function formatDiscoverDateOptionLabel(dateKey: string, today: string): string {
  const tomorrow = format(addDays(new Date(`${today}T00:00:00`), 1), 'yyyy-MM-dd');
  if (dateKey === tomorrow) return `Tomorrow (${format(new Date(`${dateKey}T00:00:00`), 'dd/MM')})`;
  return formatDiscoverDateLabel(dateKey, today);
}

/** The Date filter's 7 quick-pick options (today + next 6 days), `yyyy-MM-dd`, same window
 * `SessionStartTimePicker` offers for session scheduling. Anything beyond this is reached via the
 * "Pick a date…" calendar, same as that picker. */
export function discoverQuickDates(now: Date = new Date()): string[] {
  const floor = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => format(addDays(floor, i), 'yyyy-MM-dd'));
}
