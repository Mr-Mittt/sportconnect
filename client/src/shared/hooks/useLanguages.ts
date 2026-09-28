import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { LanguageResponse } from '@/shared/types/reference';

/** Constant — one active-language list, shared by every caller. */
export const languagesQueryKey = ['reference', 'languages'] as const;

/**
 * `GET /api/reference/languages` — active languages, by `sort_order`. Public (no auth), returned
 * `name` is always English, `staleTime: Infinity` since reference rows essentially never change
 * within a session (same reasoning as `useChatConversation`'s idempotent-server-side data) — an
 * admin edit is a rare, cross-session event, not something this app needs to reflect live.
 */
export function useLanguages(): {
  data: LanguageResponse[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: languagesQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<LanguageResponse[]>>('/reference/languages');
      return response.data.data;
    },
    staleTime: Infinity,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
