import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { ResetPasswordPayload } from './types';

/** Backend codes (A8) meaning the link itself is unusable — the page swaps the form for a "request a new link" state. */
export const RESET_LINK_ERROR_CODES = ['RESET_TOKEN_INVALID', 'RESET_TOKEN_USED', 'RESET_TOKEN_EXPIRED'] as const;

export function isResetLinkErrorCode(code: string | null | undefined): boolean {
  return (RESET_LINK_ERROR_CODES as readonly string[]).includes(code ?? '');
}

async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await apiClient.post<ApiResponse<null>>('/auth/reset-password', payload);
}

/**
 * Wraps POST /auth/reset-password. Does not log the user in (the backend revokes their refresh
 * tokens on reset); the caller sends them to /login on success. `errorCode` lets the page tell a
 * dead link (`RESET_TOKEN_*`) from a field/validation or transport error, which stays a banner.
 */
export function useResetPassword(options?: { onSuccess?: () => void }): {
  resetPassword: (payload: ResetPasswordPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
} {
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: resetPassword,
    onSuccess: () => options?.onSuccess?.(),
  });

  return {
    resetPassword: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    errorCode: mutation.error ? (getApiError(mutation.error).code ?? null) : null,
  };
}
