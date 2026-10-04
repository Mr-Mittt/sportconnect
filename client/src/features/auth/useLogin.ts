import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getErrorMessage } from '@/shared/lib/apiError';
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
 * step. `errorMessage` is the server's own message (deliberately generic —
 * "Invalid email or password" — never reveals which field was wrong), or a
 * fallback for network-level failures the server never got to respond to.
 */
export function useLogin(options?: { onSuccess?: (user: User) => void }): {
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
  });

  const errorMessage = mutation.error ? getErrorMessage(mutation.error) : null;

  return {
    login: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage,
  };
}
