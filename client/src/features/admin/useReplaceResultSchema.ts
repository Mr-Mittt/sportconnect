import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError } from '@/shared/lib/apiError';
import { resultSchemaQueryKey } from '@/shared/hooks/useResultSchema';
import type { ApiResponse } from '@/shared/types/api';
import { adminKeys } from './queryKeys';
import type { ResultSchemaDocument } from './useResultSchemaAdmin';

/**
 * SPORT-18: wraps `PUT /api/sports/{sportId}/result-schema` (SESSION-50), the result-schema half of the
 * sport detail panel. Replaces the whole document. The server validates only what it reads (`maxRecords`,
 * an integer from 1 to 500) and the 16 KB size cap, and stores the rest as sent; the client's own reading
 * of the document is reported by the editor's hint (`parseRecordSchema`), not enforced here.
 *
 * On success both the admin read and the member read of the same sport are invalidated, so an open
 * session detail picks the new schema up.
 */
export function useReplaceResultSchema(sportId: number | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (schema: ResultSchemaDocument) => {
      const response = await apiClient.put<ApiResponse<ResultSchemaDocument | null>>(
        `/sports/${sportId}/result-schema`,
        schema,
      );
      return response.data.data;
    },
    onSuccess: () => {
      if (sportId === undefined) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.resultSchema(sportId) });
      queryClient.invalidateQueries({ queryKey: resultSchemaQueryKey(sportId) });
    },
  });

  // CLIENT-I18N-6: admin editors are English-only, so show the server's own text (or this fixed fallback).
  const errorMessage = mutation.error
    ? (getApiError(mutation.error).message ?? 'Could not save the result schema. Please try again.')
    : null;

  return {
    replaceSchema: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
