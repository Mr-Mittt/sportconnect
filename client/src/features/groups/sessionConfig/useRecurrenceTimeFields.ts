import { useState } from 'react';
import { clockEndTime } from '@/shared/lib/recurrenceDay';

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

/** `start + duration` as a wall-clock `HH:mm` (past midnight it wraps to the next day's clock), or `''` without a usable start or duration. */
export function endFromStartAndDuration(start: string, duration: string): string {
  const minutes = Number(duration);
  if (toMinutes(start) === null || duration === '' || !Number.isInteger(minutes) || minutes <= 0) return '';
  return clockEndTime(start, minutes) ?? '';
}

/**
 * Minutes from `start` to `end` on a clock with no date: an end earlier than the start is the next day's (a session over midnight), so the
 * answer is always 1 to 1,439. `''` when either is missing, or when they are the same time (which would be 0 or a whole day).
 */
export function durationFromStartAndEnd(start: string, end: string): string {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null || from === to) return '';
  return String((to - from + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}

export interface RecurrenceTimeFields {
  /** The wall-clock start, `HH:mm` (a regular session has no date). */
  start: string;
  /** Whole minutes, `''` while unknown. */
  duration: string;
  /** The wall-clock end, `HH:mm`; earlier than the start means the next day. */
  end: string;
  /** Moving the start keeps the duration and moves the end (no duration: the end stays and the duration follows). */
  setStart: (next: string) => void;
  /** Editing the duration derives the end. */
  setDuration: (next: string) => void;
  /** Editing the end derives the duration. */
  setEnd: (next: string) => void;
  /** The end is the start itself, or the duration is a whole day or more: nothing to save. */
  isEndInvalid: boolean;
}

/**
 * CLIENT-GROUP-SESSION-5: the recurrence form's linked time fields, the date-less sibling of `useSessionTimeFields`. Whichever of duration and end
 * was edited last is the source and the other follows; the start moves the end when there is a duration.
 */
export function useRecurrenceTimeFields(initial: { start: string; duration: string }): RecurrenceTimeFields {
  const [start, setStartState] = useState(initial.start);
  const [duration, setDurationState] = useState(initial.duration);
  const [end, setEndState] = useState(() => endFromStartAndDuration(initial.start, initial.duration));

  const setStart = (next: string) => {
    setStartState(next);
    if (duration !== '') setEndState(endFromStartAndDuration(next, duration));
    else if (end !== '') setDurationState(durationFromStartAndEnd(next, end));
  };
  const setDuration = (next: string) => {
    setDurationState(next);
    setEndState(endFromStartAndDuration(start, next));
  };
  const setEnd = (next: string) => {
    setEndState(next);
    setDurationState(durationFromStartAndEnd(start, next));
  };

  return {
    start,
    duration,
    end,
    setStart,
    setDuration,
    setEnd,
    isEndInvalid: (start !== '' && end !== '' && start === end) || Number(duration) >= MINUTES_PER_DAY,
  };
}
