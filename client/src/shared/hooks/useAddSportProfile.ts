import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import type { AddSportProfileSubmission } from '@/shared/components/AddSportFields';
import { sessionKeys } from '@/features/session/queryKeys';
import type { ApiResponse } from '@/shared/types/api';
import type { UserSportProfileResponse } from '@/shared/types/sport';
import {
  sportProfilesQueryKey,
  sportProfilesWithInactiveQueryKey,
} from './useRawMySportProfiles';

/** SPORT-10: a fresh create carries the form fields; a reactivate carries only
 * `{ sportId, isResume: true }` (backend A20 ignores the rest of the body on resume). */
export type AddSportProfilePayload = AddSportProfileSubmission;

/**
 * Wraps `POST /api/sports/profiles` — the "Add sport" flow SportSwitcher's
 * dashed pill opens. Same "write the new item into the query cache
 * directly, then invalidate in the background" shape as `useCreateGroup`:
 * the new profile needs to show up in the switcher immediately, not after a
 * refetch round trip. The backend enforces the 3-profile cap and rejects a
 * duplicate sport (400) — surfaced via `isError`, same as every other
 * mutation-backed modal in this app (CreateGroupModal, JoinGroupModal).
 *
 * `userId` is kept as a readiness guard only — SPORT-11 / A22 collapsed the
 * cache to the single caller-scoped `sportProfilesQueryKey` (no per-user
 * fan-out), so this just skips the optimistic write until a user is known.
 */
export function useAddSportProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddSportProfilePayload) => {
      const response = await apiClient.post<ApiResponse<UserSportProfileResponse>>(
        '/sports/profiles',
        payload,
      );
      return response.data.data;
    },
    onSuccess: (profile) => {
      if (userId === undefined) return;
      queryClient.setQueryData<UserSportProfileResponse[]>(
        sportProfilesQueryKey,
        (data) => (data ? [...data, profile] : [profile]),
      );
    },
    onSettled: () => {
      if (userId === undefined) return;
      queryClient.invalidateQueries({ queryKey: sportProfilesQueryKey });
      // SPORT-10: a reactivate flips a soft-deleted row to active — the
      // `?includeInactive=true` list (`useResumableSports`) must drop it.
      queryClient.invalidateQueries({ queryKey: sportProfilesWithInactiveQueryKey });
      // GET /sessions/discover is gated server-side to sports the caller holds an active
      // profile for (see useDiscoverSessions's own doc comment) — without this, a Discover
      // view opened while the caller had zero profiles (e.g. SessionDiscoverModal/
      // CreateSessionModal's own "no sport profiles yet" gate) keeps serving its cached empty
      // result after a profile is added, since nothing else re-triggers that query. Partial key
      // (no sportId suffix) invalidates every discover cache entry, not just one sportId's.
      queryClient.invalidateQueries({ queryKey: [...sessionKeys.all, 'discover'] });
    },
  });
}
