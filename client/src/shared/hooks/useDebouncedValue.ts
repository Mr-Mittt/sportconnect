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

  // `immediate` syncs during render rather than in an effect — React's own
  // recommended fix for "adjust state in response to a prop change"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // calling setState here bails out and re-renders before the browser
  // paints, so there's no extra visible frame, and it sidesteps
  // react-hooks/set-state-in-effect (which flags the equivalent
  // `useEffect(() => setDebounced(value), ...)` as a cascading-render risk)
  // entirely rather than fighting it. Guarded so it only fires the render
  // it's actually needed, not on every render while `immediate` is true.
  if (immediate && debounced !== value) {
    setDebounced(value);
  }

  useEffect(() => {
    if (immediate) return;
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs, immediate]);

  return debounced;
}
