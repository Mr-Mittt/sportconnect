import { useMutation } from '@tanstack/react-query';
import i18next from 'i18next';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult, LoginPayload, User } from './types';

async function login(payload: LoginPayload): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/login', payload);
  return response.data.data;
}

/**
 * Wraps POST /auth/login in a TanStack mutation. On success, populates
 * authStore directly — callers don't need a separate "now save the session"
 * step. `errorMessage` is localized: a 401 carries `INVALID_CREDENTIALS` (deliberately generic,
 * never reveals which field was wrong). Correct credentials for a deactivated account answer
 * `ACCOUNT_DEACTIVATED` instead (backend A9): `onAccountDeactivated` then receives the submitted
 * payload so the page can offer re-activation (AUTH-10); the inline message stays as the fallback. A 400
 * `VALIDATION_FAILED` (a blank or whitespace-only field the form let through) shows that same
 * generic line, since the login API should not describe what is wrong with the input
 * (CLIENT-ERR-2). Anything else follows the shared classifier (category copy, e.g. offline or 5xx).
 */
export function useLogin(options?: {
  onSuccess?: (user: User) => void;
  onAccountDeactivated?: (payload: LoginPayload) => void;
}): {
  login: (payload: LoginPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
} {
  const setSession = useAuthStore((state) => state.setSession);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: login,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
    onError: (error, payload) => {
      if (getApiError(error).code === 'ACCOUNT_DEACTIVATED') options?.onAccountDeactivated?.(payload);
    },
  });

  const errorMessage = mutation.error
    ? getApiError(mutation.error).code === 'VALIDATION_FAILED'
      ? i18next.t('errors:codes.INVALID_CREDENTIALS')
      : getErrorMessage(mutation.error)
    : null;

  return {
    login: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage,
  };
}
