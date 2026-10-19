import { useCallback, useEffect, useState } from 'react';

/** Whole seconds from `nowMs` until `untilMs`, rounded up and never negative. */
export function secondsUntil(untilMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
}

/** `m:ss`, for a countdown the user watches ("Resend in 0:42", "try again in 14:05"). */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * ACCOUNT-6: a countdown that is started by an event ("a code was just sent, wait 60 s") and read as
 * whole seconds left. Re-renders every half second while it runs and stops at 0. It keeps a deadline
 * rather than decrementing, so a throttled background tab catches up the moment it wakes. `start`
 * takes the clock reading in the event handler, so the first render already shows the full length.
 */
export function useCountdown(): { secondsLeft: number; start: (seconds: number) => void; stop: () => void } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const start = useCallback((seconds: number) => {
    setEndsAt(Date.now() + seconds * 1000);
    setSecondsLeft(Math.max(0, Math.ceil(seconds)));
  }, []);
  const stop = useCallback(() => {
    setEndsAt(null);
    setSecondsLeft(0);
  }, []);

  useEffect(() => {
    if (endsAt === null) return undefined;
    const id = setInterval(() => {
      const left = secondsUntil(endsAt, Date.now());
      setSecondsLeft(left);
      if (left === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  return { secondsLeft, start, stop };
}
