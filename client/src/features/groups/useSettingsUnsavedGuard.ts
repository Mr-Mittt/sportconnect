import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupInfo } from '@/features/feed/hooks/useGroupInfo';
import { useGroupSettings } from '@/features/feed/hooks/useGroupSettings';
import { useUpdateGroup } from '@/features/feed/hooks/useUpdateGroup';
import { useUpdateGroupSettings } from '@/features/feed/hooks/useUpdateGroupSettings';
import { feedKeys } from '@/features/feed/queryKeys';
import type { UpdateGroupSettingsPayload } from '@/features/feed/types';

interface GroupInfoDraft {
  rules?: string;
  schedule?: string;
}

/**
 * Owns the Settings tab's draft/Save/unsaved-changes-guard state (GRP-2),
 * across both collapsible sections: Permission (the three owner-only
 * `GroupSettings` toggles, via `updateGroupSettings`) and General's
 * rules/schedule text fields (via the existing `updateGroup` endpoint —
 * same one Privacy uses, but Privacy itself stays immediate-apply,
 * untouched, since a toggle click isn't the same UX problem a free-text
 * field commit-per-keystroke would be). One shared draft/Save/dialog for
 * both sections — editing either marks the whole tab dirty.
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
export function useSettingsUnsavedGuard(
  groupId: number | undefined,
  isSettingsTabActive: boolean,
  currentUserId: string | undefined,
) {
  const [settingsDraft, setSettingsDraft] = useState<UpdateGroupSettingsPayload>({});
  const [infoDraft, setInfoDraft] = useState<GroupInfoDraft>({});
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  // A stale draft from a previously viewed group must not bleed into the
  // next one — adjusted during render (React's own documented pattern, same
  // as PublicOnlyRoute's decision-locking) rather than an effect, since
  // eslint-plugin-react-hooks v7 forbids a synchronous setState in an effect
  // body.
  const [lastGroupId, setLastGroupId] = useState(groupId);
  if (groupId !== lastGroupId) {
    setLastGroupId(groupId);
    setSettingsDraft({});
    setInfoDraft({});
  }

  const queryClient = useQueryClient();
  const settingsQuery = useGroupSettings(groupId, isSettingsTabActive);
  const infoQuery = useGroupInfo(groupId, isSettingsTabActive);
  const updateSettingsMutation = useUpdateGroupSettings();
  // Separate instance from any Privacy-toggle `useUpdateGroup` elsewhere on
  // the page — keeps this hook's `isSaving`/`isSaveError` scoped to its own
  // Save button, not conflated with Privacy's independent pending/error state.
  const updateGroupMutation = useUpdateGroup(currentUserId);

  const savedSettings = settingsQuery.data;
  const savedInfo = infoQuery.data;

  const hasSettingsChanges =
    savedSettings !== undefined &&
    (Object.keys(settingsDraft) as Array<keyof UpdateGroupSettingsPayload>).some(
      (key) => settingsDraft[key] !== undefined && settingsDraft[key] !== savedSettings[key],
    );
  const hasInfoChanges =
    savedInfo !== undefined &&
    ((infoDraft.rules !== undefined && infoDraft.rules !== (savedInfo.rules ?? '')) ||
      (infoDraft.schedule !== undefined && infoDraft.schedule !== (savedInfo.schedule ?? '')));
  const hasUnsavedChanges = hasSettingsChanges || hasInfoChanges;

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

  function updateSettingField<K extends keyof UpdateGroupSettingsPayload>(
    key: K,
    value: UpdateGroupSettingsPayload[K],
  ) {
    setSettingsDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateInfoField<K extends keyof GroupInfoDraft>(key: K, value: GroupInfoDraft[K]) {
    setInfoDraft((prev) => ({ ...prev, [key]: value }));
  }

  function discard() {
    setSettingsDraft({});
    setInfoDraft({});
    if (blocker.state === 'blocked') blocker.proceed();
    pendingAction?.();
    setPendingAction(null);
  }

  function resolveAfterSave() {
    setSettingsDraft({});
    setInfoDraft({});
    if (blocker.state === 'blocked') blocker.proceed();
    pendingAction?.();
    setPendingAction(null);
  }

  function save() {
    if (groupId === undefined) return;
    const pending: Promise<unknown>[] = [];
    if (hasSettingsChanges) {
      pending.push(
        new Promise((resolve, reject) =>
          updateSettingsMutation.mutate(
            { groupId, payload: settingsDraft },
            { onSuccess: resolve, onError: reject },
          ),
        ),
      );
    }
    if (hasInfoChanges) {
      pending.push(
        new Promise((resolve, reject) =>
          updateGroupMutation.mutate(
            { groupId, payload: infoDraft },
            {
              onSuccess: () => {
                // GroupResponse (updateGroup's own return shape) never
                // includes rules/schedule — patch the groupInfo cache
                // directly with what we know was just sent, rather than an
                // extra round-trip refetch.
                queryClient.setQueryData(feedKeys.groupInfo(groupId), (prev: typeof savedInfo) =>
                  prev
                    ? {
                        ...prev,
                        rules: infoDraft.rules ?? prev.rules,
                        schedule: infoDraft.schedule ?? prev.schedule,
                      }
                    : prev,
                );
                resolve(undefined);
              },
              onError: reject,
            },
          ),
        ),
      );
    }
    Promise.all(pending).then(resolveAfterSave).catch(() => {
      // Failure surfaces via isSaveError below — nothing further to do here,
      // and the dialog/pendingAction deliberately stay open so the user can
      // retry Save rather than losing the draft.
    });
  }

  function cancelLeave() {
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  }

  return {
    settings: savedSettings !== undefined ? { ...savedSettings, ...settingsDraft } : undefined,
    isSettingsLoading: settingsQuery.isLoading,
    isSettingsError: settingsQuery.isError,
    updateSettingField,
    info: savedInfo !== undefined ? { ...savedInfo, ...infoDraft } : undefined,
    isInfoLoading: infoQuery.isLoading,
    isInfoError: infoQuery.isError,
    updateInfoField,
    hasUnsavedChanges,
    save,
    isSaving: updateSettingsMutation.isPending || updateGroupMutation.isPending,
    isSaveError: updateSettingsMutation.isError || updateGroupMutation.isError,
    guard,
    isLeaveDialogOpen: pendingAction !== null || blocker.state === 'blocked',
    discard,
    cancelLeave,
  };
}
