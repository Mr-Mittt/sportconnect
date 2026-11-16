import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { keepWithinSearch } from '@/shared/lib/keepWithinSearch';
import type { ApiResponse } from '@/shared/types/api';
import { sessionKeys } from '../queryKeys';
import type { ThreadPerson } from '../types';

/**
 * How many people a list under a comment box shows (the server's default, SESSION-GL-64). One more is asked for: the caller sees
 * the thread too and is never offered to tag themselves in a normal comment, so the list still fills when they match.
 */
export const THREAD_PEOPLE_SIZE = 5;

/**
 * Wraps `GET /api/sessions/{sessionId}/thread-people?q=&size=` (SESSION-GL-64): the people who can see the session's
 * thread (participants, and a group session's members), matched on first and last name as the user types
 * (word-start, accent-insensitive). `query` is the text after the `@`; `null` turns the call off (idle). The previous list
 * stays while the next request of the same `@` word loads, so the list does not flicker, and is never carried into the
 * next `@` (`search` counts the words the owner has seen end, see `keepWithinSearch`): a failed call is an empty list,
 * never the last one. The box keeps working without it.
 */
export function useThreadPeople(sessionId: number | undefined, query: string | null, search = 0) {
  return useQuery({
    queryKey: sessionKeys.threadPeople(sessionId ?? -1, query),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ThreadPerson[]>>(`/sessions/${sessionId}/thread-people`, {
        params: { q: query ?? '', size: THREAD_PEOPLE_SIZE + 1 },
      });
      return response.data.data;
    },
    enabled: sessionId !== undefined && query !== null,
    meta: { search },
    placeholderData: keepWithinSearch<ThreadPerson[]>(search),
    staleTime: 30_000,
    retry: false,
  });
}
