import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { RecordChangeSetRequest, RecordChangeSetResponse } from '../resultTypes';
import type { ApiResponse } from '@/shared/types/api';

/**
 * CLIENT-GL-38: wraps `POST /api/sessions/{sessionId}/records/changes` (SESSION-50), one change set per
 * dialog Save. A 200 means the request was well formed: read each result's `status`, a bad record comes
 * back `REJECTED` while the valid ones are already stored. A non-2xx (400 malformed request, 403, 409
 * window closed or not loggable, 413) refused the whole request and is shown inside the dialog
 * (`meta.errorDisplay: 'inline'`), so the draft survives.
 *
 * On success the response's `records` replace the cached list instead of triggering a refetch: it is
 * already the fresh list, including other players' changes.
 */
export function useApplyRecordChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async ({ sessionId, changes }: { sessionId: number; changes: RecordChangeSetRequest }) => {
      const response = await apiClient.post<ApiResponse<RecordChangeSetResponse>>(
        `/sessions/${sessionId}/records/changes`,
        changes,
      );
      return response.data.data;
    },
    onSuccess: (data, { sessionId }) => {
      queryClient.setQueryData(sessionKeys.records(sessionId), data.records);
    },
  });
}
