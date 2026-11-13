import { addMinutes, differenceInMinutes, format, isValid, parse } from 'date-fns';
import { useState } from 'react';

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function parseLocal(value: string): Date | null {
  if (value === '') return null;
  const parsed = parse(value, LOCAL_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

/** `start + duration` as a local `yyyy-MM-ddTHH:mm`, or `''` when either is missing or invalid.
 * May land on the next day (the end picker shows the date). */
export function endFromStartAndDuration(start: string, durationMinutes: string): string {
  const startDate = parseLocal(start);
  const minutes = Number(durationMinutes);
  if (startDate === null || durationMinutes === '' || !Number.isInteger(minutes) || minutes <= 0) return '';
  return format(addMinutes(startDate, minutes), LOCAL_FORMAT);
}

/** Whole minutes from `start` to `end`, or `null` when either is missing or the end is not after the start. */
export function durationFromStartAndEnd(start: string, end: string): number | null {
  const startDate = parseLocal(start);
  const endDate = parseLocal(end);
  if (startDate === null || endDate === null) return null;
  const minutes = differenceInMinutes(endDate, startDate);
  return minutes > 0 ? minutes : null;
}

/** How far before now a start may be and still count as "now" (a form left open for a minute still submits); the server rule (SESSION-62) uses the same 5 minutes. */
export const START_GRACE_MINUTES = 5;

/** True when `start` (a local `yyyy-MM-ddTHH:mm`) is earlier than now minus the grace; an empty or unreadable start is not in the past. */
export function isStartInPast(start: string, now: Date = new Date()): boolean {
  const startDate = parseLocal(start);
  return startDate !== null && differenceInMinutes(now, startDate) > START_GRACE_MINUTES;
}

/** True when both are set and the end is not after the start — the end field's error state. */
export function isEndNotAfterStart(start: string, end: string): boolean {
  const startDate = parseLocal(start);
  const endDate = parseLocal(end);
  return startDate !== null && endDate !== null && differenceInMinutes(endDate, startDate) <= 0;
}

export interface SessionTimeFields {
  start: string;
  duration: string;
  end: string;
  /** Moving the start keeps the duration and moves the end. */
  setStart: (next: string) => void;
  /** Editing the duration derives the end. */
  setDuration: (next: string) => void;
  /** Editing the end derives the duration (cleared when the end is not after the start). */
  setEnd: (next: string) => void;
  isEndInvalid: boolean;
  /** The start is earlier than now (minus the grace) and was changed from what the form opened with: blocks Create / Save. */
  isStartInPast: boolean;
}

/**
 * The When section's three linked fields (CLIENT-SESSION-34): whichever was edited last is the
 * source and the others follow. Edit the duration -> end = start + duration; edit the end ->
 * duration = end - start; edit the start -> the duration stays and the end moves. An end that is not
 * after the start flags `isEndInvalid` and clears the duration rather than guessing one.
 */
export function useSessionTimeFields(initial: { start: string; duration: string }): SessionTimeFields {
  const [start, setStartState] = useState(initial.start);
  const [duration, setDurationState] = useState(initial.duration);
  const [end, setEndState] = useState(() => endFromStartAndDuration(initial.start, initial.duration));

  const setStart = (next: string) => {
    setStartState(next);
    if (duration !== '') {
      setEndState(endFromStartAndDuration(next, duration));
    } else if (end !== '') {
      const derived = durationFromStartAndEnd(next, end);
      setDurationState(derived === null ? '' : String(derived));
    }
  };
  const setDuration = (next: string) => {
    setDurationState(next);
    setEndState(endFromStartAndDuration(start, next));
  };
  const setEnd = (next: string) => {
    setEndState(next);
    const derived = durationFromStartAndEnd(start, next);
    setDurationState(derived === null ? '' : String(derived));
  };

  return {
    start,
    duration,
    end,
    setStart,
    setDuration,
    setEnd,
    isEndInvalid: isEndNotAfterStart(start, end),
    // An existing session whose stored start is already past is only blocked once its start is edited.
    isStartInPast: start !== initial.start && isStartInPast(start),
  };
}
