import { useEffect, useState } from 'react';

/**
 * Returns `value`, delayed by `delayMs` after the last change — the caller
 * decides what "debounced" means for its own gating logic (e.g. also
 * requiring a minimum length before firing a query). Generic/reusable:
 * first consumer is FRIEND-1's directory search, which needs real
 * debounce-as-you-type (unlike JoinGroupModal's explicit-submit search).
 *
 * `immediate` (default `false`) skips the timer and syncs `debounced` to
 * `value` on the very next render instead — for a caller that needs to
 * force-settle a stale debounced value deterministically rather than
 * waiting out `delayMs` of real time. `useInviteFriendModalData` (GRP-4)
 * passes `!isOpen`: while its modal is closed, resetting the search input
 * should resolve immediately, not on the normal typing-speed timer — a
 * modal reopened faster than `delayMs` after closing would otherwise still
 * be carrying the *previous* session's debounced query text (and, from
 * TanStack Query's cache keyed on that exact text, its stale results) for
 * up to `delayMs` after reopening. Real typing while open always passes
 * `immediate: false`, so this doesn't change debounce-while-typing at all.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, immediate = false): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (immediate) {
      setDebounced(value);
      return;
    }
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs, immediate]);

  return debounced;
}
