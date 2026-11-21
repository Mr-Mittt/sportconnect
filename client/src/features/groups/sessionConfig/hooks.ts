import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '@/features/feed/queryKeys';
import { sessionKeys } from '@/features/session/queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import { sessionConfigKeys } from './queryKeys';
import type { RecurrencePayload } from './recurrenceForm';
import type { GroupSessionRecurrence, GroupSessionSettings, UpdateGroupSessionSettingsPayload } from './types';

/**
 * CLIENT-GROUP-SESSION-4: `GET /api/sessions/group/{groupId}/settings` (any member). `enabled` gates the fetch to while the Settings tab is open,
 * like `useGroupSettings`.
 */
export function useGroupSessionSettings(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionConfigKeys.settings(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupSessionSettings>>(`/sessions/group/${groupId}/settings`);
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}

/** `GET /api/sessions/group/{groupId}/recurrences` (any member): the configurations of **both** modes; the caller shows the group's current mode. */
export function useGroupSessionRecurrences(groupId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionConfigKeys.recurrences(groupId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<GroupSessionRecurrence[]>>(`/sessions/group/${groupId}/recurrences`);
      return response.data.data;
    },
    enabled: enabled && groupId !== undefined,
  });
}

interface UpdateSettingsVariables {
  groupId: number;
  payload: UpdateGroupSessionSettingsPayload;
}

/**
 * `PUT /api/sessions/group/{groupId}/settings` (owner or admin, a partial update). The answer goes straight into the settings cache (a mode
 * switch changes no configuration). Every change writes a group post on the server, and a cancel (`cancelScheduled`) removes sessions from the
 * group's Sessions tab, so both are refreshed.
 */
export function useUpdateGroupSessionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ groupId, payload }: UpdateSettingsVariables) => {
      const response = await apiClient.put<ApiResponse<GroupSessionSettings>>(`/sessions/group/${groupId}/settings`, payload);
      return response.data.data;
    },
    onSuccess: (settings, { groupId }) => {
      queryClient.setQueryData(sessionConfigKeys.settings(groupId), settings);
      void queryClient.invalidateQueries({ queryKey: feedKeys.groupFeed(groupId) });
      if (settings.cancelledSessions > 0) {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.groupSessions(groupId) });
      }
    },
  });
}

interface DeleteRecurrenceVariables {
  groupId: number;
  recurrenceId: number;
  cancelScheduled?: boolean;
}

/** What a count of scheduled regular sessions is about: the whole group (OFF, mode switch) or one configuration (delete). */
export type RegularSessionScope = 'ALL' | 'RECURRENCE';

interface CountScheduledVariables {
  groupId: number;
  scope: RegularSessionScope;
  /** Required with `scope: 'RECURRENCE'`. */
  recurrenceId?: number;
}

/**
 * CLIENT-GROUP-SESSION-6: `GET /api/sessions/group/{groupId}/regular-sessions/count` (owner or admin): how many `SCHEDULED` / `PREPARING` regular
 * sessions a delete or a mode switch would leave behind. A mutation, not a query: it is asked once, on the user's confirm, and its answer is not
 * cached (a cached count could be stale by the next click). `isError` and `reset` drive the "try again" dialog.
 */
export function useCountScheduledRegularSessions() {
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ groupId, scope, recurrenceId }: CountScheduledVariables) => {
      const response = await apiClient.get<ApiResponse<{ count: number }>>(`/sessions/group/${groupId}/regular-sessions/count`, {
        params: { scope, recurrenceId },
      });
      return response.data.data.count;
    },
  });
}

/**
 * `DELETE /api/sessions/group/{groupId}/recurrences/{id}` (owner or admin, a hard delete). `cancelScheduled` (CLIENT-GROUP-SESSION-6) also cancels the
 * scheduled sessions already generated from it (`?cancelScheduled=true`); the group's sessions are then refreshed, because the answer's `count` says how
 * many left the Scheduled section.
 */
export function useDeleteGroupSessionRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ groupId, recurrenceId, cancelScheduled }: DeleteRecurrenceVariables) => {
      const response = await apiClient.delete<ApiResponse<{ count: number }>>(`/sessions/group/${groupId}/recurrences/${recurrenceId}`, {
        params: cancelScheduled === true ? { cancelScheduled: true } : undefined,
      });
      return response.data.data;
    },
    onSuccess: (answer, { groupId, recurrenceId }) => {
      queryClient.setQueryData<GroupSessionRecurrence[]>(sessionConfigKeys.recurrences(groupId), (list) =>
        list?.filter((recurrence) => recurrence.id !== recurrenceId),
      );
      void queryClient.invalidateQueries({ queryKey: feedKeys.groupFeed(groupId) });
      if ((answer?.count ?? 0) > 0) {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.groupSessions(groupId) });
      }
    },
  });
}

/** How long after a save the group's sessions are read again: the server generates the slot a change causes in the background, a moment after it answers. */
export const GENERATION_REFRESH_DELAY_MS = 3000;

interface SaveRecurrenceVariables {
  groupId: number;
  /** Set = replace that configuration (`PUT`), unset = add one (`POST`, in the group's current mode). */
  recurrenceId?: number;
  payload: RecurrencePayload;
}

/**
 * CLIENT-GROUP-SESSION-5: `POST` / `PUT /api/sessions/group/{groupId}/recurrences[/{id}]` (owner or admin). The saved configuration goes straight
 * into the list (added, or replacing the old one) and the group's feed is refreshed (every change writes a group post). Generation is
 * asynchronous, so the answer never holds the session the change causes: the group's sessions are read again at once and once more a few
 * seconds later.
 */
export function useSaveGroupSessionRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ groupId, recurrenceId, payload }: SaveRecurrenceVariables) => {
      const url = `/sessions/group/${groupId}/recurrences`;
      const response =
        recurrenceId === undefined
          ? await apiClient.post<ApiResponse<GroupSessionRecurrence>>(url, payload)
          : await apiClient.put<ApiResponse<GroupSessionRecurrence>>(`${url}/${recurrenceId}`, payload);
      return response.data.data;
    },
    onSuccess: (saved, { groupId }) => {
      queryClient.setQueryData<GroupSessionRecurrence[]>(sessionConfigKeys.recurrences(groupId), (list) => [
        ...(list ?? []).filter((recurrence) => recurrence.id !== saved.id),
        saved,
      ]);
      void queryClient.invalidateQueries({ queryKey: feedKeys.groupFeed(groupId) });
      void queryClient.invalidateQueries({ queryKey: sessionKeys.groupSessions(groupId) });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.groupSessions(groupId) });
      }, GENERATION_REFRESH_DELAY_MS);
    },
  });
}
