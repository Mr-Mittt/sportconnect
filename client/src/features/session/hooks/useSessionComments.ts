import { useInfiniteQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/app/apiClient';
import { getNextPageParam } from '@/features/feed/pagination';
import type { Comment, PagedApiResponse } from '@/features/feed/types';
import { sessionKeys } from '../queryKeys';

const PAGE_SIZE = 20;

/**
 * Wraps `GET /api/sessions/{sessionId}/comments` (root-level only, paginated; each root
 * comment's `replies` is fully populated server-side, one level deep — same shape as
 * `useComments`). SESSION-10 gates this endpoint to JOINED/REQUESTED/INVITED participants (or
 * group members for a group-linked session) — the client has no reliable way to know that ahead
 * of the request today (`callerParticipation` doesn't exist client-side until CLIENT-SESSION-9),
 * so a 403 here is the real visibility gate, not an error: `retry` skips the default backoff for
 * both 403 and 404 so `useSessionCommentsData` can read the response status and hide the
 * comment section entirely rather than show "Couldn't load comments." `sessionId` follows
 * `useSession`/`useSessionParticipants`'s `number | undefined` convention (no session selected
 * yet), not `useComments`'s stricter `number`.
 */
export function useSessionComments(sessionId: number | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: sessionKeys.comments(sessionId ?? -1),
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<PagedApiResponse<Comment>>(
        `/sessions/${sessionId}/comments`,
        { params: { page: pageParam, size: PAGE_SIZE } },
      );
      return response.data.data;
    },
    initialPageParam: 0,
    getNextPageParam,
    enabled: enabled && sessionId !== undefined,
    retry: (failureCount, error) => {
      const status = (error as AxiosError).response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 3;
    },
  });
}
