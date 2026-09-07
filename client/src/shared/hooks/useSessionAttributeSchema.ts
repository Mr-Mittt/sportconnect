import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';

export const sessionAttributeSchemaQueryKey = (sportId: number) =>
  ['sessionAttributeSchema', sportId] as const;

/**
 * CLIENT-SESSION-14: reads one sport's **session** attribute schema, via the member-facing
 * `GET /api/sports/{sportId}/session-attribute-schema` (A17, `modules/sport/sport-impl`). A 1:1
 * sibling of {@link useSportAttributeSchema} — same resolved shape, same `Accept-Language`-resolved
 * labels — differing only in the endpoint and the query key. The resolved session schema adds the
 * optional `prefillable`/`prefillKey` marker on `#ref` nodes (see `ResolvedSportAttributeDefinition`);
 * CLIENT-SESSION-15 uses it to pre-fill from the caller's sport profile.
 *
 * `data` is `null` — not an error — for a sport whose sessions offer no attributes; the backend
 * returns `data: null` for that case by design. The endpoint is active-only and 404s for a
 * deactivated sport (A6/A7 invisibility), surfaced here as `isError`.
 */
export function useSessionAttributeSchema(sportId: number | undefined): {
  data: ResolvedSportAttributeSchema | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: sessionAttributeSchemaQueryKey(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ResolvedSportAttributeSchema | null>>(
        `/sports/${sportId}/session-attribute-schema`,
      );
      return response.data.data;
    },
    enabled: sportId !== undefined,
  });

  return {
    data: query.data ?? null,
    // A disabled query sits in `pending` with `isLoading` true, which would render a
    // permanent spinner when no sport is selected.
    isLoading: sportId !== undefined && query.isLoading,
    isError: query.isError,
  };
}
