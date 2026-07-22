import { useEffect, useState } from 'react';

/**
 * Returns `value`, delayed by `delayMs` after the last change — the caller
 * decides what "debounced" means for its own gating logic (e.g. also
 * requiring a minimum length before firing a query). Generic/reusable:
 * first consumer is FRIEND-1's directory search, which needs real
 * debounce-as-you-type (unlike JoinGroupModal's explicit-submit search).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
