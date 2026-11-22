import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import { describeImportError } from './importErrors';
import type { ImportPreview, ImportRequest } from './types';

/**
 * CLIENT-ADMIN-IMPORT-1: wraps `POST /api/sessions/import/preview` (SESSION-70). It writes nothing on the server: it
 * matches the file's names against the group's active members and reports each session with its games, the names it could
 * not settle and the members to settle them with. A mutation, not a query: it runs when the admin asks and is never cached.
 */
export function useImportPreview() {
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (request: ImportRequest) => {
      const response = await apiClient.post<ApiResponse<ImportPreview>>('/sessions/import/preview', request);
      return response.data.data;
    },
  });

  return {
    preview: mutation.mutate,
    data: mutation.data,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? describeImportError(mutation.error) : null,
    reset: mutation.reset,
  };
}
