import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { SportAttributeSchema } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/**
 * ADMIN-2: reads one sport's attribute schema for the admin editor, via A11's admin-only
 * `GET /api/sports/all/{sportId}/attribute-schema`.
 *
 * `data` is `null` — not an error — for a sport that offers no attributes; the backend
 * returns `data: null` for that case by design.
 *
 * **Deliberately not the member-facing `GET /api/sports/{sportId}/attribute-schema`.** That one
 * resolves through the active-only sport cache and 404s for a deactivated sport, which made the
 * editor's central flow — configure a sport's attributes *before* activating it — impossible.
 * A11 added this admin twin (resolved via `findById`, matching what the `PUT` on the same
 * document has always accepted) rather than widening the member read, which must stay
 * active-only to keep a deactivated sport invisible to members (A6/A7). Same
 * active-only-vs-admin split as `GET /api/sports` and `GET /api/sports/all`.
 */
export function useSportAttributeSchema(sportId: number | undefined): {
  data: SportAttributeSchema | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: adminKeys.attributeSchema(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SportAttributeSchema | null>>(
        `/sports/all/${sportId}/attribute-schema`,
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
