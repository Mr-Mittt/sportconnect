import { useEffect, useRef } from 'react';

/**
 * Attaches an IntersectionObserver to the returned ref; calls onIntersect
 * when that element scrolls into view, as long as `enabled` is true (e.g.
 * gate this on `hasNextPage && !isFetchingNextPage` so it doesn't re-fire
 * mid-fetch or once the list is exhausted). `rootMargin` starts the fetch
 * ~200px before the sentinel actually enters the viewport, so the next page
 * is usually ready before the user reaches the bottom.
 *
 * Callers must also provide a keyboard/screen-reader-reachable alternative
 * trigger (e.g. a "Load more" button) alongside this — scroll-position-only
 * triggers aren't reachable without a pointing device or continuous
 * scrolling, which fails the app's accessibility baseline on their own.
 */
export function useInfiniteScrollSentinel(onIntersect: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!enabled) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersectRef.current();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return sentinelRef;
}
