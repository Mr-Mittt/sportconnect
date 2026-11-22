import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { describeImportError } from './importErrors';
import type { ImportApplyResult, ImportRequest } from './types';

/**
 * CLIENT-ADMIN-IMPORT-1: wraps `POST /api/sessions/import` (SESSION-70). The server refuses the whole call while a name is
 * unresolved, otherwise it creates each session in its own transaction and answers per session: created, skipped (already
 * there) or failed (an unexpected error for that session only; the others still went in, and sending the same request again
 * retries only the failed ones). It sends no notification. Not cached.
 */
export function useImportApply() {
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (request: ImportRequest) => {
      const response = await apiClient.post<ApiResponse<ImportApplyResult>>('/sessions/import', request);
      return response.data.data;
    },
  });

  return {
    apply: mutation.mutate,
    data: mutation.data,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? describeImportError(mutation.error) : null,
    reset: mutation.reset,
  };
}
