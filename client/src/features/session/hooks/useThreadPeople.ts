import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { sessionKeys } from '../queryKeys';
import type { ThreadPerson } from '../types';

/** How many people one call asks for: the server's default (SESSION-GL-64), enough for a list under a comment box. */
export const THREAD_PEOPLE_SIZE = 5;

/**
 * Wraps `GET /api/sessions/{sessionId}/thread-people?q=&size=` (SESSION-GL-64): the people who can see the session's
 * thread (participants, and a group session's members), matched on first and last name as the user types
 * (word-start, accent-insensitive). `query` is the text after the `@`; `null` turns the call off. The previous list
 * stays on screen while the next one loads, so the `@` list does not flicker. A failed call is an empty list: the box
 * keeps working without it.
 */
export function useThreadPeople(sessionId: number | undefined, query: string | null) {
  return useQuery({
    queryKey: sessionKeys.threadPeople(sessionId ?? -1, query ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ThreadPerson[]>>(`/sessions/${sessionId}/thread-people`, {
        params: { q: query ?? '', size: THREAD_PEOPLE_SIZE },
      });
      return response.data.data;
    },
    enabled: sessionId !== undefined && query !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}
