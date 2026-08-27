import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * PROFILE-10: the generic "warn before leaving with unsaved changes"
 * primitive, extracted from `useSettingsUnsavedGuard`'s own `useBlocker` +
 * `beforeunload` + `pendingAction` plumbing (`features/groups/`) — that
 * logic was never actually group-specific, just built alongside the Settings
 * tab's own draft/save state the first time this pattern was needed. This
 * version owns none of that: the caller supplies `hasUnsavedChanges` and
 * decides what "leaving" means for its own in-page actions via `guard()`.
 *
 * `GroupsPage`'s own `useSettingsUnsavedGuard` is deliberately left as-is —
 * migrating it onto this primitive is a real refactor with its own
 * regression risk, not requested here.
 *
 * "Leaving" while dirty is caught two ways automatically, matching the
 * established precedent:
 * - In-app navigation to a different route — `useBlocker` (requires the data
 *   router from ROUTER-1, already in use app-wide).
 * - Browser close/refresh/typed-URL navigation — `beforeunload` (native
 *   prompt only, no custom text possible — a hard platform restriction).
 *
 * An in-page action (a tab switch, a pill click) is not automatically
 * caught — the caller wraps its own handler in `guard()`, same as
 * `useSettingsUnsavedGuard`'s callers already do.
 */
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  function guard(action: () => void) {
    if (hasUnsavedChanges) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  /** Call once whatever "leaving" resolves to (a discard, or a successful save) is settled. */
  function proceed() {
    if (blocker.state === 'blocked') blocker.proceed();
    pendingAction?.();
    setPendingAction(null);
  }

  function cancelLeave() {
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  }

  return {
    guard,
    isLeaveDialogOpen: pendingAction !== null || blocker.state === 'blocked',
    proceed,
    cancelLeave,
  };
}
