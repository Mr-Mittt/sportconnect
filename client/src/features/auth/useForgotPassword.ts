import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { ForgotPasswordPayload } from './types';

async function forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  await apiClient.post<ApiResponse<null>>('/auth/forgot-password', payload);
}

/**
 * Wraps POST /auth/forgot-password. The server answers the same 200 whether or not the email has
 * an account (anti-enumeration), so `isSuccess` only means "request accepted" — the UI must show a
 * neutral confirmation and never hint at account existence. Only a 400 (malformed email) or a
 * network/5xx failure produces an `errorMessage`.
 */
export function useForgotPassword(): {
  requestReset: (payload: ForgotPasswordPayload) => void;
  isPending: boolean;
  isSuccess: boolean;
  errorMessage: string | null;
} {
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: forgotPassword,
  });

  return {
    requestReset: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
  };
}
