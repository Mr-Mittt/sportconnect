import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { ValidateResetTokenPayload } from './types';

async function checkResetToken(payload: ValidateResetTokenPayload): Promise<true> {
  await apiClient.post<ApiResponse<null>>('/auth/reset-password/validate', payload);
  return true;
}

/**
 * Asks the server, when the reset page opens, whether the link can still be used (backend A21).
 * `POST` with a body so the token stays out of access logs; the call has no side effects. Every
 * unusable token (unknown, already used, expired) is the same 404 `RESET_TOKEN_INVALID`, so
 * `isLinkInvalid` cannot say why — the specific used/expired copy still comes from the submit.
 *
 * Disabled without a token (the page already treats that as invalid). A transport or 5xx failure
 * is *not* reported as an invalid link: the form stays usable and the submit tells the truth.
 * Never cached or refetched: the answer is only meaningful for this page load.
 */
export function useResetTokenCheck(token: string | null): {
  isChecking: boolean;
  isLinkInvalid: boolean;
} {
  const query = useQuery({
    queryKey: ['auth', 'reset-token-check', token],
    queryFn: () => checkResetToken({ token: token ?? '' }),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  return {
    isChecking: Boolean(token) && query.isPending,
    isLinkInvalid: query.isError && getApiError(query.error).code === 'RESET_TOKEN_INVALID',
  };
}
