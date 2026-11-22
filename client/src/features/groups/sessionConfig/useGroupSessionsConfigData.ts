import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import {
  useCountScheduledRegularSessions,
  useDeleteGroupSessionRecurrence,
  useGroupSessionRecurrences,
  useGroupSessionSettings,
  useUpdateGroupSessionSettings,
  type RegularSessionScope,
} from './hooks';
import { useRecurrenceFormData, type RecurrenceFormData } from './useRecurrenceFormData';
import type { GroupSessionRecurrence, GroupSessionSettings, RecurrenceMode } from './types';

/** What the group settings' Sessions section reads and does (CLIENT-GROUP-SESSION-4). Undefined data while loading, like every `use...Data` hook. */
export interface GroupSessionsConfigData {
  settings: GroupSessionSettings | undefined;
  isSettingsLoading: boolean;
  isSettingsError: boolean;
  /** The configurations of **both** modes; the section shows the group's current mode. */
  recurrences: GroupSessionRecurrence[] | undefined;
  isRecurrencesLoading: boolean;
  isRecurrencesError: boolean;
  /** Turn generation on or off. `cancelScheduled` (OFF only) also cancels the group's scheduled regular sessions. */
  onSetEnabled: (enabled: boolean, cancelScheduled?: boolean) => void;
  /** Switch the mode. `cancelScheduled` also cancels the group's scheduled regular sessions (CLIENT-GROUP-SESSION-6). */
  onSetMode: (mode: RecurrenceMode, cancelScheduled?: boolean) => void;
  /** Delete a configuration. `cancelScheduled` also cancels the scheduled sessions it generated (CLIENT-GROUP-SESSION-6). */
  onDelete: (recurrenceId: number, cancelScheduled?: boolean) => void;
  /**
   * CLIENT-GROUP-SESSION-6: asks how many scheduled regular sessions a delete (`RECURRENCE` + the configuration's id) or a mode switch (`ALL`) would
   * leave behind, and hands the number to `onCount`; on a failure `isCountError` turns true and `onCount` is not called.
   */
  onCountScheduled: (scope: RegularSessionScope, recurrenceId: number | undefined, onCount: (count: number) => void) => void;
  /** A count lookup is in flight. */
  isCounting: boolean;
  /** The last count lookup failed (the change it was meant to precede has not been made). */
  isCountError: boolean;
  /** Forgets a failed lookup (the dialog closed, or a new try starts). */
  onResetCount: () => void;
  /** A failed ON/OFF or mode switch. */
  isUpdateError: boolean;
  updateErrorText?: string;
  /** A failed delete. */
  isDeleteError: boolean;
  deleteErrorText?: string;
  isBusy: boolean;
  /** The recurrence form behind Add and Edit (CLIENT-GROUP-SESSION-5). */
  recurrenceForm: RecurrenceFormData;
}

/**
 * CLIENT-GROUP-SESSION-4's data boundary: the group's regular-session settings and configurations, and the three actions the section has
 * (ON/OFF, the mode, delete). Fetches only while the Settings tab is open (`enabled`). Each action saves at once; this is not part of the
 * settings tab's draft/Save/unsaved-changes guard.
 */
export function useGroupSessionsConfigData(
  groupId: number | undefined,
  enabled: boolean,
  /** The group's sport: the recurrence form's location, favourites and attributes are scoped to it. */
  sportId?: number,
): GroupSessionsConfigData {
  const settingsQuery = useGroupSessionSettings(groupId, enabled);
  const recurrencesQuery = useGroupSessionRecurrences(groupId, enabled);
  const updateMutation = useUpdateGroupSessionSettings();
  const deleteMutation = useDeleteGroupSessionRecurrence();
  const countMutation = useCountScheduledRegularSessions();
  const recurrenceForm = useRecurrenceFormData(groupId, sportId);

  return {
    settings: settingsQuery.data,
    isSettingsLoading: settingsQuery.isLoading,
    isSettingsError: settingsQuery.isError,
    recurrences: recurrencesQuery.data,
    isRecurrencesLoading: recurrencesQuery.isLoading,
    isRecurrencesError: recurrencesQuery.isError,
    onSetEnabled: (nextEnabled, cancelScheduled) => {
      if (groupId === undefined) return;
      updateMutation.mutate({
        groupId,
        payload: nextEnabled ? { enabled: true } : { enabled: false, cancelScheduled: cancelScheduled === true },
      });
    },
    onSetMode: (mode, cancelScheduled) => {
      if (groupId === undefined) return;
      updateMutation.mutate({ groupId, payload: cancelScheduled === true ? { mode, cancelScheduled: true } : { mode } });
    },
    onDelete: (recurrenceId, cancelScheduled) => {
      if (groupId === undefined) return;
      deleteMutation.mutate({ groupId, recurrenceId, cancelScheduled });
    },
    onCountScheduled: (scope, recurrenceId, onCount) => {
      if (groupId === undefined) return;
      // TanStack calls this per-call callback only for the latest `mutate` and only until `reset`, so an answer to a lookup the caller has since
      // abandoned (the dialog closed, a newer lookup) never reaches `onCount`.
      countMutation.mutate({ groupId, scope, recurrenceId }, { onSuccess: (count) => onCount(count) });
    },
    isCounting: countMutation.isPending,
    isCountError: countMutation.isError,
    onResetCount: countMutation.reset,
    isUpdateError: updateMutation.isError,
    updateErrorText: getCodedErrorMessage(updateMutation.error),
    isDeleteError: deleteMutation.isError,
    deleteErrorText: getCodedErrorMessage(deleteMutation.error),
    isBusy: updateMutation.isPending || deleteMutation.isPending || countMutation.isPending,
    recurrenceForm,
  };
}
