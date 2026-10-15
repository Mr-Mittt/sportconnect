import { useMutation } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult, CallbackPayload, User } from './types';

/** What the callback page hands over: the code to exchange, or the fact that it cannot be exchanged. */
export type CallbackInput = CallbackPayload | 'invalid';

async function exchangeCode(input: CallbackInput): Promise<AuthResult> {
  if (input === 'invalid') {
    // The page already knows this sign-in is unusable (Keycloak sent `error`, the `state` does not
    // match, or the PKCE entry is gone): fail the same way the backend does for a bad code, so one
    // path renders the localized `AUTH_CODE_INVALID` line.
    const response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {},
      data: { success: false, message: 'Invalid callback', errorCode: 'AUTH_CODE_INVALID' },
    } as AxiosResponse;
    throw new AxiosError('Invalid callback', 'ERR_BAD_REQUEST', undefined, undefined, response);
  }
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/callback', input);
  return response.data.data;
}

/**
 * AUTH-14: finishes a Keycloak sign-in. Posts `{code, codeVerifier}` to `POST /api/auth/callback`
 * (backend A26); on success populates authStore, like the old login did. Passing `'invalid'` skips the
 * request and fails with `AUTH_CODE_INVALID`.
 *
 * A deactivated password user is answered `401 ACCOUNT_DEACTIVATED` with the one-time ticket in
 * `errorParams.reactivationTicket` (no session, no cookie): `onAccountDeactivated` then receives the
 * ticket so the page can open the confirm dialog. Social users never see that — the backend
 * re-activates them and returns the session. Every other failure (`AUTH_CODE_INVALID`,
 * `PHONE_ALREADY_USED`, `EMAIL_ALREADY_REGISTERED`, `SERVICE_UNAVAILABLE`, …) is `errorMessage`,
 * the localized line for the page's error view.
 */
export function useAuthCallback(options?: {
  onSuccess?: (user: User) => void;
  onAccountDeactivated?: (ticket: string) => void;
}): {
  exchange: (input: CallbackInput) => void;
  isPending: boolean;
  errorMessage: string | null;
} {
  const setSession = useAuthStore((state) => state.setSession);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: exchangeCode,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
    onError: (error) => {
      const apiError = getApiError(error);
      const ticket = apiError.params?.reactivationTicket;
      if (apiError.code === 'ACCOUNT_DEACTIVATED' && typeof ticket === 'string') {
        options?.onAccountDeactivated?.(ticket);
      }
    },
  });

  const apiError = mutation.error ? getApiError(mutation.error) : null;
  const isDeactivated =
    apiError?.code === 'ACCOUNT_DEACTIVATED' && typeof apiError.params?.reactivationTicket === 'string';

  return {
    exchange: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error && !isDeactivated ? getErrorMessage(mutation.error) : null,
  };
}
