import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `intervalMs` while `enabled`. Drives anything that must change by itself
 * as time passes (a countdown, a button that disappears at a cutoff) without a server round trip.
 * Disabled, it stops its timer and returns the time of its last tick.
 */
export function useNow(intervalMs: number, enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    // An immediate tick (not a synchronous setState) so a re-enabled clock does not show a stale time for a whole interval.
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs, enabled]);
  return now;
}
