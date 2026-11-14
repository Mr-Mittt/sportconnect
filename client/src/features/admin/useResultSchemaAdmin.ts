import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { adminKeys } from './queryKeys';

/** A sport's result (record) schema document, exactly as stored: see `documentation/md/RECORD_SCHEMA_CONTRACT.md`. */
export type ResultSchemaDocument = Record<string, unknown>;

/**
 * SPORT-18: reads one sport's raw **result** schema for the admin editor, via the admin-only
 * `GET /api/sports/all/{sportId}/result-schema` (SESSION-50). The admin twin of the member-facing
 * `useResultSchema` (`shared/hooks/`): the same document, but it also resolves for a deactivated sport.
 *
 * `data` is `null`, not an error, for a sport without result logging.
 */
export function useResultSchemaAdmin(sportId: number | undefined): {
  data: ResultSchemaDocument | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: adminKeys.resultSchema(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ResultSchemaDocument | null>>(
        `/sports/all/${sportId}/result-schema`,
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
