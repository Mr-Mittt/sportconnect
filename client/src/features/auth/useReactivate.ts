import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult, LoginPayload, User } from './types';

async function reactivate(payload: LoginPayload): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/reactivate', payload);
  return response.data.data;
}

/**
 * Wraps POST /auth/reactivate (backend A9) — same body and same `AuthResponse` as login: the
 * server re-verifies the credentials, re-activates the account and logs the user in, so success
 * populates authStore exactly like `useLogin`. Offered by the login page after a login answered
 * `ACCOUNT_DEACTIVATED` (AUTH-10), reusing the credentials just typed. A wrong password is
 * `INVALID_CREDENTIALS` and leaves the account deactivated; `errorMessage` is the localized line
 * for it. `reset` clears that error (used when the dialog closes).
 */
export function useReactivate(options?: { onSuccess?: (user: User) => void }): {
  reactivate: (payload: LoginPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  reset: () => void;
} {
  const setSession = useAuthStore((state) => state.setSession);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: reactivate,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
  });

  return {
    reactivate: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}
