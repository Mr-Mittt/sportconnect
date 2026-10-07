import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { isGeoServerCode } from '@/shared/lib/geoErrors';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult, RegisterPayload, User } from './types';

async function register(payload: RegisterPayload): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/register', payload);
  return response.data.data;
}

/**
 * Wraps POST /auth/register in a TanStack mutation. Registration also logs
 * the user in (same `AuthResult` shape as login) — on success this populates
 * authStore directly, no separate "now log in" step. `errorMessage` is localized through the
 * shared classifier (`EMAIL_ALREADY_REGISTERED`, `VALIDATION_FAILED`, category copy for offline or
 * 5xx). `errorCode` and `errorFields` (the server field names of a `VALIDATION_FAILED`) let the form
 * add a sign-in link or name the failed fields (CLIENT-ERR-2).
 */
export function useRegister(options?: { onSuccess?: (user: User) => void }): {
  register: (payload: RegisterPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  errorFields: string[];
} {
  const setSession = useAuthStore((state) => state.setSession);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: register,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
  });

  const apiError = mutation.error ? getApiError(mutation.error) : null;
  // CLIENT-ERR-8: a rejected country / region shows in the form's geo hint line (keyed on `errorCode`),
  // so the banner stays empty for it.
  const errorMessage =
    mutation.error && !isGeoServerCode(apiError?.code) ? getErrorMessage(mutation.error) : null;
  const fields = apiError?.params?.fields;
  const errorFields =
    apiError?.code === 'VALIDATION_FAILED' && fields && typeof fields === 'object' ? Object.keys(fields) : [];

  return {
    register: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage,
    errorCode: apiError?.code ?? null,
    errorFields,
  };
}
