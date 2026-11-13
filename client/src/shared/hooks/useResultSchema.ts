import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';

export const resultSchemaQueryKey = (sportId: number) => ['resultSchema', sportId] as const;

/**
 * CLIENT-GL-38: reads one sport's raw **result schema** (SESSION-50), via the member-facing
 * `GET /api/sports/{sportId}/result-schema`. The server stores the document exactly as the admin sent
 * it and does not localize it, so `data` is untyped JSON here: `parseResultSchema` turns it into a
 * typed schema (or `null` for one this client does not understand).
 *
 * `data` is `null`, not an error, for a sport without result logging. The endpoint 404s for an
 * inactive sport, surfaced as `isError`.
 */
export function useResultSchema(sportId: number | undefined): {
  data: Record<string, unknown> | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: resultSchemaQueryKey(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Record<string, unknown> | null>>(
        `/sports/${sportId}/result-schema`,
      );
      return response.data.data;
    },
    enabled: sportId !== undefined,
  });
  return {
    data: query.data ?? null,
    isLoading: sportId !== undefined && query.isLoading,
    isError: query.isError,
  };
}
