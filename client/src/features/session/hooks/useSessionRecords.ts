import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { sessionKeys } from '../queryKeys';
import type { SessionRecord } from '../resultTypes';
import type { ApiResponse } from '@/shared/types/api';

/**
 * CLIENT-GL-38: wraps `GET /api/sessions/{sessionId}/records` (SESSION-50), oldest first. A 403
 * (`SESSION_RECORD_NOT_ALLOWED`) is surfaced as `isError`; the Result section hides itself then, the
 * same way the Discussion section does for its own 403.
 */
export function useSessionRecords(sessionId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.records(sessionId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SessionRecord[]>>(`/sessions/${sessionId}/records`);
      return response.data.data;
    },
    enabled: enabled && sessionId !== undefined,
    // A 403 is final: don't retry it before the section can hide itself.
    retry: false,
  });
}
