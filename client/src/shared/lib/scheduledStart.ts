import { formatISO, isValid, parse } from 'date-fns';

/**
 * Turns `SessionStartTimePicker`'s bare local wall-clock value (`yyyy-MM-dd'T'HH:mm`, in the
 * browser's own zone) into the offset-aware ISO-8601 string backend SESSION-33 requires for
 * `CreateSessionRequest`/`UpdateSessionRequest.scheduledStart` (a `java.time.Instant` — Jackson
 * rejects an offset-less string with a 400), e.g. `2026-09-24T11:00:00+07:00`, or `…Z` in UTC.
 *
 * The offset is computed for the *selected* instant, not cached once from "now", so a date weeks
 * out across a DST change gets its own correct offset. DST edge cases follow the ECMAScript
 * `Date` rules deterministically: a wall-clock time skipped by a spring-forward gap resolves
 * forward, an ambiguous fall-back time resolves to its earlier occurrence.
 *
 * @throws if `localDateTime` isn't a complete `yyyy-MM-dd'T'HH:mm` value — callers gate on
 *   `scheduledStart !== ''` first, so this is a programming error, not a user-facing state.
 */
export function toOffsetAwareIso(localDateTime: string): string {
  const parsed = parse(localDateTime, "yyyy-MM-dd'T'HH:mm", new Date());
  if (!isValid(parsed)) {
    throw new Error(`Invalid scheduledStart "${localDateTime}" — expected yyyy-MM-ddTHH:mm`);
  }
  return formatISO(parsed);
}
