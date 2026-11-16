import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Which text boxes of a modal hold something typed (the comment box, each open reply box). A box reports under its own
 * key whenever it gains or loses text; `hasDraft` is true while any of them has some.
 */
export function useDraftRegistry() {
  const [keys, setKeys] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback((key: string, hasDraft: boolean) => {
    setKeys((current) => {
      if (current.has(key) === hasDraft) return current;
      const next = new Set(current);
      if (hasDraft) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return { hasDraft: keys.size > 0, report };
}

/**
 * Closing a modal that holds an unsent comment or reply (owner, 2026-11-16): the close (X, Esc, outside click) asks
 * first, "Keep editing" or "Leave". Closing the tab or refreshing gets the browser's own prompt. No router needed, so
 * it works for a modal that is state-driven and for one that is driven by the URL (the caller's `onClose` navigates).
 */
export function useCloseWithDraftGuard(hasDraft: boolean, onClose: () => void) {
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    if (!hasDraft) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasDraft]);

  return useMemo(
    () => ({
      requestClose: () => (hasDraft ? setIsAsking(true) : onClose()),
      // A draft that is gone (sent, or emptied) while the question is up needs no answer.
      isAsking: isAsking && hasDraft,
      stay: () => setIsAsking(false),
      leave: () => {
        setIsAsking(false);
        onClose();
      },
    }),
    [hasDraft, isAsking, onClose],
  );
}
