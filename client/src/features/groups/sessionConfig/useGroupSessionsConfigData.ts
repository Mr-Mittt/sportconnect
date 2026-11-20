import { getCodedErrorMessage } from '@/shared/lib/codedErrorMessage';
import {
  useDeleteGroupSessionRecurrence,
  useGroupSessionRecurrences,
  useGroupSessionSettings,
  useUpdateGroupSessionSettings,
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
  onSetMode: (mode: RecurrenceMode) => void;
  onDelete: (recurrenceId: number) => void;
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
    onSetMode: (mode) => {
      if (groupId === undefined) return;
      updateMutation.mutate({ groupId, payload: { mode } });
    },
    onDelete: (recurrenceId) => {
      if (groupId === undefined) return;
      deleteMutation.mutate({ groupId, recurrenceId });
    },
    isUpdateError: updateMutation.isError,
    updateErrorText: getCodedErrorMessage(updateMutation.error),
    isDeleteError: deleteMutation.isError,
    deleteErrorText: getCodedErrorMessage(deleteMutation.error),
    isBusy: updateMutation.isPending || deleteMutation.isPending,
    recurrenceForm,
  };
}
