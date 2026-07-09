import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '@/app/apiClient';
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
 * authStore directly, no separate "now log in" step. `errorMessage` is the
 * server's own message (e.g. email already taken), or a fallback for
 * network-level failures the server never got to respond to.
 */
export function useRegister(options?: { onSuccess?: (user: User) => void }): {
  register: (payload: RegisterPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
} {
  const setSession = useAuthStore((state) => state.setSession);

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
  });

  const errorMessage = mutation.error
    ? (axios.isAxiosError(mutation.error) &&
        (mutation.error.response?.data as ApiResponse<null> | undefined)?.message) ||
      'Something went wrong. Please try again.'
    : null;

  return {
    register: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage,
  };
}
