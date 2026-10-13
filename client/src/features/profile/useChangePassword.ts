import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';

interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.put('/users/me/password', payload);
}

/**
 * Wraps `PUT /api/users/me/password` (backend `UserController.changePassword`). The session
 * continues on success — the server revokes nothing today (per-session revocation is backend
 * A15/A18), so there is nothing to sign out of. `errorMessage` is the localized line;
 * `isCurrentPasswordError` is true for `CURRENT_PASSWORD_INCORRECT`, which the dialog shows on the
 * current-password field rather than as a general line. `reset` clears both when the dialog closes.
 */
export function useChangePassword(options?: { onSuccess?: () => void }): {
  changePassword: (payload: ChangePasswordPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  isCurrentPasswordError: boolean;
  reset: () => void;
} {
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: changePassword,
    onSuccess: () => options?.onSuccess?.(),
  });

  return {
    changePassword: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    isCurrentPasswordError: mutation.error ? getApiError(mutation.error).code === 'CURRENT_PASSWORD_INCORRECT' : false,
    reset: mutation.reset,
  };
}
