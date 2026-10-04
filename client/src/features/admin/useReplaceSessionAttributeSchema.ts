import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { SessionAttributeSchema } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/**
 * ADMIN-5: wraps `PUT /api/sports/{sportId}/session-attribute-schema` (A17) — the session-schema
 * half of the sport detail panel. Replaces the whole document; there is no partial update
 * server-side, and an invalid document is rejected in full rather than half-applied.
 *
 * The exact sibling of `useReplaceSportAttributeSchema` (profile schema), kept separate because
 * the backend keeps the two endpoints and documents separate — see that hook's note on why one
 * "Save everything" button cannot span two HTTP calls.
 *
 * `errorMessage` is A17's own validation text (`#ref "gear/tension" does not resolve...`,
 * `"Duplicate group key: match"`, size cap, ...) surfaced verbatim — the validator is the
 * authority on document validity and reimplementing its rules client-side would drift.
 */
export function useReplaceSessionAttributeSchema(sportId: number | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (schema: SessionAttributeSchema) => {
      const response = await apiClient.put<ApiResponse<SessionAttributeSchema | null>>(
        `/sports/${sportId}/session-attribute-schema`,
        schema,
      );
      return response.data.data;
    },
    onSuccess: () => {
      if (sportId === undefined) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.sessionAttributeSchema(sportId) });
    },
  });

  // CLIENT-I18N-6: admin editors are English-only, so show the server's own text (or this fixed
  // English fallback) rather than the localized `errors` category copy.
  const errorMessage = mutation.error
    ? (getApiError(mutation.error).message ??
      'Could not save the session attribute schema. Please try again.')
    : null;

  return {
    replaceSchema: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
