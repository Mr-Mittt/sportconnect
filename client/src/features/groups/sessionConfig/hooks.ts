import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { feedKeys } from '@/features/feed/queryKeys';
import { sessionKeys } from '@/features/session/queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import { sessionConfigKeys } from './queryKeys';
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
}

/** `DELETE /api/sessions/group/{groupId}/recurrences/{id}` (owner or admin, a hard delete); sends no `cancelScheduled` (CLIENT-GROUP-SESSION-6 adds the prompt). */
export function useDeleteGroupSessionRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ groupId, recurrenceId }: DeleteRecurrenceVariables) => {
      await apiClient.delete(`/sessions/group/${groupId}/recurrences/${recurrenceId}`);
    },
    onSuccess: (_data, { groupId, recurrenceId }) => {
      queryClient.setQueryData<GroupSessionRecurrence[]>(sessionConfigKeys.recurrences(groupId), (list) =>
        list?.filter((recurrence) => recurrence.id !== recurrenceId),
      );
      void queryClient.invalidateQueries({ queryKey: feedKeys.groupFeed(groupId) });
    },
  });
}
