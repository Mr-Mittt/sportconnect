import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useGroupSettings } from '@/features/feed/hooks/useGroupSettings';
import { useUpdateGroupSettings } from '@/features/feed/hooks/useUpdateGroupSettings';
import type { UpdateGroupSettingsPayload } from '@/features/feed/types';

/**
 * Owns the Settings tab's draft/Save/unsaved-changes-guard state (GRP-2).
 * Only the three owner-only `GroupSettings` toggles go through this draft —
 * Privacy (`updateGroup`, owner+admin) stays immediate-apply, untouched.
 *
 * "Leaving" while dirty is caught three ways:
 * - In-page tab/group switches — callers wrap their switch handlers in
 *   `guard()`.
 * - In-app navigation to a different route (e.g. NavTabs) — `useBlocker`
 *   (requires the data router from ROUTER-1; unavailable with a plain
 *   `<BrowserRouter>`).
 * - Browser close/refresh/typed-URL navigation — `beforeunload`. This can
 *   only ever show the browser's own generic native prompt (no custom text
 *   or buttons possible — a hard platform restriction since ~2011), never
 *   this hook's Discard/Save dialog.
 *
 * Both the blocked-navigation case and a guarded in-page action share one
 * dialog: `isLeaveDialogOpen` is true if either fired, `discard`/`save`
 * resolve whichever is pending.
 */
export function useSettingsUnsavedGuard(groupId: number | undefined, isSettingsTabActive: boolean) {
  const [draft, setDraft] = useState<UpdateGroupSettingsPayload>({});
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  // A stale draft from a previously viewed group must not bleed into the
  // next one — adjusted during render (React's own documented pattern, same
  // as PublicOnlyRoute's decision-locking) rather than an effect, since
  // eslint-plugin-react-hooks v7 forbids a synchronous setState in an effect
  // body.
  const [lastGroupId, setLastGroupId] = useState(groupId);
  if (groupId !== lastGroupId) {
    setLastGroupId(groupId);
    setDraft({});
  }

  const settingsQuery = useGroupSettings(groupId, isSettingsTabActive);
  const updateMutation = useUpdateGroupSettings();

  const saved = settingsQuery.data;
  const hasUnsavedChanges =
    saved !== undefined &&
    (Object.keys(draft) as Array<keyof UpdateGroupSettingsPayload>).some(
      (key) => draft[key] !== undefined && draft[key] !== saved[key],
    );

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

  function updateField<K extends keyof UpdateGroupSettingsPayload>(
    key: K,
    value: UpdateGroupSettingsPayload[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function discard() {
    setDraft({});
    if (blocker.state === 'blocked') blocker.proceed();
    pendingAction?.();
    setPendingAction(null);
  }

  function save() {
    if (groupId === undefined) return;
    updateMutation.mutate(
      { groupId, payload: draft },
      {
        onSuccess: () => {
          setDraft({});
          if (blocker.state === 'blocked') blocker.proceed();
          pendingAction?.();
          setPendingAction(null);
        },
      },
    );
  }

  function cancelLeave() {
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  }

  return {
    settings: saved !== undefined ? { ...saved, ...draft } : undefined,
    isLoading: settingsQuery.isLoading,
    isError: settingsQuery.isError,
    updateField,
    hasUnsavedChanges,
    save,
    isSaving: updateMutation.isPending,
    isSaveError: updateMutation.isError,
    guard,
    isLeaveDialogOpen: pendingAction !== null || blocker.state === 'blocked',
    discard,
    cancelLeave,
  };
}
