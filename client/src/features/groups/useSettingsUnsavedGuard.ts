import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useGroupGeneralData } from '@/features/feed/hooks/useGroupGeneralData';
import { useGroupSettings } from '@/features/feed/hooks/useGroupSettings';
import { useUpdateGroupGeneralData } from '@/features/feed/hooks/useUpdateGroupGeneralData';
import { useUpdateGroupSettings } from '@/features/feed/hooks/useUpdateGroupSettings';
import type { UpdateGroupSettingsPayload } from '@/features/feed/types';
import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';

interface GroupInfoDraft {
  rules?: string;
  schedule?: string;
}

type GroupInfoKey = keyof GroupInfoDraft;

function without(draft: GroupInfoDraft, key: GroupInfoKey): GroupInfoDraft {
  const next = { ...draft };
  delete next[key];
  return next;
}

/**
 * Owns the Settings tab's draft/Save/unsaved-changes-guard state (GRP-2),
 * across both collapsible sections: Permission (the three owner-only
 * `GroupSettings` toggles, via `updateGroupSettings`) and General's
 * rules/schedule text fields (via `updateGroupGeneralData`, PUT
 * .../generalData, B19/GRP-9 — a dedicated endpoint scoped to these fields,
 * separate from Privacy's own `updateGroup`/PUT /{groupId} call elsewhere on
 * the page, which stays immediate-apply, untouched, since a toggle click
 * isn't the same UX problem a free-text field commit-per-keystroke would
 * be). Since CLIENT-GROUP-SESSION-4 the two sections save differently: the Permission toggles have their own Save button (`saveSettings`), and a
 * rules/schedule field is saved when it loses focus (`commitInfoField`). A field being saved is shown from `pendingInfo` and is not dirty (leaving
 * the tab right after typing must not raise the dialog); a failed save puts the text back into the draft, so it is dirty again, guarded, and the
 * dialog's Save retries it. The dialog's `save()` still saves every dirty draft.
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
) {
  const [settingsDraft, setSettingsDraft] = useState<UpdateGroupSettingsPayload>({});
  const [infoDraft, setInfoDraft] = useState<GroupInfoDraft>({});
  const [pendingInfo, setPendingInfo] = useState<GroupInfoDraft>({});
  const [failedInfoField, setFailedInfoField] = useState<GroupInfoKey | null>(null);
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
    setPendingInfo({});
    setFailedInfoField(null);
  }

  const settingsQuery = useGroupSettings(groupId, isSettingsTabActive);
  const infoQuery = useGroupGeneralData(groupId, isSettingsTabActive);
  const updateSettingsMutation = useUpdateGroupSettings();
  // Separate instance from any Privacy-toggle `useUpdateGroup` elsewhere on
  // the page — keeps this hook's `isSaving`/`isSaveError` scoped to its own
  // Save button, not conflated with Privacy's independent pending/error state.
  const updateGeneralDataMutation = useUpdateGroupGeneralData();

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

  /** A rules/schedule field lost focus: save its draft on its own (a partial `PUT .../generalData`), unless it did not change. */
  function commitInfoField(key: GroupInfoKey) {
    const value = infoDraft[key];
    if (groupId === undefined || value === undefined) return;
    if (value === (savedInfo?.[key] ?? '')) {
      setInfoDraft((prev) => without(prev, key));
      return;
    }
    setInfoDraft((prev) => without(prev, key));
    setPendingInfo((prev) => ({ ...prev, [key]: value }));
    setFailedInfoField(null);
    updateGeneralDataMutation.mutateAsync({ groupId, payload: { [key]: value } }).then(
      () => setPendingInfo((prev) => without(prev, key)),
      () => {
        setPendingInfo((prev) => without(prev, key));
        setInfoDraft((prev) => ({ ...prev, [key]: value }));
        setFailedInfoField(key);
      },
    );
  }

  /** The Permission section's Save: only the toggles (a rules/schedule draft that failed to save is left for the dialog's Save). */
  function saveSettings() {
    if (groupId === undefined || !hasSettingsChanges) return;
    updateSettingsMutation.mutateAsync({ groupId, payload: settingsDraft }).then(
      () => setSettingsDraft({}),
      () => {
        // The failure shows through `settingsSaveError`; the draft stays so the user can retry.
      },
    );
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
          updateGeneralDataMutation.mutate(
            { groupId, payload: infoDraft },
            { onSuccess: resolve, onError: reject },
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
    info: savedInfo !== undefined ? { ...savedInfo, ...pendingInfo, ...infoDraft } : undefined,
    isInfoLoading: infoQuery.isLoading,
    isInfoError: infoQuery.isError,
    updateInfoField,
    commitInfoField,
    /** The last rules/schedule field whose save failed, with its coded text; null when there is none. */
    infoFieldError:
      failedInfoField !== null ? { key: failedInfoField, text: getCodedErrorMessage(updateGeneralDataMutation.error) } : null,
    /** A Permission toggle is dirty (the Permission Save button). */
    hasSettingsChanges,
    saveSettings,
    isSavingSettings: updateSettingsMutation.isPending,
    isSettingsSaveError: updateSettingsMutation.isError,
    settingsSaveError: updateSettingsMutation.error,
    hasUnsavedChanges,
    save,
    isSaving: updateSettingsMutation.isPending || updateGeneralDataMutation.isPending,
    isSaveError: updateSettingsMutation.isError || updateGeneralDataMutation.isError,
    /** CLIENT-ERR-5: the failure behind `isSaveError`, for the specific coded line. */
    saveError: updateSettingsMutation.error ?? updateGeneralDataMutation.error,
    guard,
    isLeaveDialogOpen: pendingAction !== null || blocker.state === 'blocked',
    discard,
    cancelLeave,
  };
}
