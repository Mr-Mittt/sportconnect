import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';

export const sportAttributeSchemaQueryKey = (sportId: number) =>
  ['sportAttributeSchema', sportId] as const;

/**
 * SPORT-2: reads one sport's attribute schema for `SportAttributesFields`, via the member-facing
 * `GET /api/sports/{sportId}/attribute-schema` (A13) — labels already resolved to one string per
 * node for the caller's `Accept-Language`, unlike the admin twin
 * (`features/admin/useSportAttributeSchema.ts`, raw locale maps, different endpoint, different
 * type). This one is active-only and 404s for a deactivated sport (A6/A7 invisibility) — that's
 * correct here, unlike the admin editor which needs the raw twin specifically to configure a
 * sport's attributes before activating it.
 *
 * `data` is `null` — not an error — for a sport that offers no attributes; the backend returns
 * `data: null` for that case by design.
 */
export function useSportAttributeSchema(sportId: number | undefined): {
  data: ResolvedSportAttributeSchema | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: sportAttributeSchemaQueryKey(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ResolvedSportAttributeSchema | null>>(
        `/sports/${sportId}/attribute-schema`,
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
