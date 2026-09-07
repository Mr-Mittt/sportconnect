import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { ApiResponse } from '@/shared/types/api';
import type { SessionAttributeSchema } from '@/shared/types/sport';
import { adminKeys } from './queryKeys';

/**
 * ADMIN-5: reads one sport's raw **session** attribute schema for the admin editor, via A17's
 * admin-only `GET /api/sports/all/{sportId}/session-attribute-schema`.
 *
 * The admin twin of the member-facing `GET /api/sports/{sportId}/session-attribute-schema`
 * (`useSessionAttributeSchema` in `shared/hooks/`) — same "admin sees the raw multi-locale
 * document, including for a deactivated sport" split as `useSportAttributeSchema` vs
 * `SPORT-2`'s member read. The member read is `#ref`-expanded and locale-resolved; this one is
 * exactly what is stored, so the admin edits the real `#ref` nodes.
 *
 * `data` is `null` — not an error — for a sport whose sessions offer no attributes; the backend
 * returns `data: null` for that case by design.
 */
export function useSessionAttributeSchemaAdmin(sportId: number | undefined): {
  data: SessionAttributeSchema | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: adminKeys.sessionAttributeSchema(sportId ?? -1),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SessionAttributeSchema | null>>(
        `/sports/all/${sportId}/session-attribute-schema`,
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
