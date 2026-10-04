import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { SportAttributeSchema } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/**
 * ADMIN-2: wraps `PUT /api/sports/{sportId}/attribute-schema` — the attributes half of the
 * detail panel. Replaces the whole document; there is no partial update server-side, and an
 * invalid document is rejected in full rather than half-applied.
 *
 * Kept separate from `useUpdateSport` because the backend keeps them separate. A combined
 * "Save everything" button would fire two requests that cannot succeed or fail together —
 * there is no transaction spanning two HTTP calls — so a schema rejection after a successful
 * field write would leave a partial save with nothing to roll back. One Save per section
 * means every button maps to exactly one request.
 *
 * `errorMessage` is the server's own validation text (`"Duplicate group key: gear"`,
 * `"Attribute schema exceeds the maximum allowed size (16KB)"`, …) surfaced verbatim — A9 is
 * the authority on document validity and reimplementing its rules client-side would drift.
 */
export function useReplaceSportAttributeSchema(sportId: number | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: async (schema: SportAttributeSchema) => {
      const response = await apiClient.put<ApiResponse<SportAttributeSchema | null>>(
        `/sports/${sportId}/attribute-schema`,
        schema,
      );
      return response.data.data;
    },
    onSuccess: () => {
      if (sportId === undefined) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.attributeSchema(sportId) });
    },
  });

  // CLIENT-I18N-6: admin editors are English-only, so show the server's own text (or this fixed
  // English fallback) rather than the localized `errors` category copy.
  const errorMessage = mutation.error
    ? (getApiError(mutation.error).message ??
      'Could not save the attribute schema. Please try again.')
    : null;

  return {
    replaceSchema: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage,
    reset: mutation.reset,
  };
}
