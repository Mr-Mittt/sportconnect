import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { usePasswordLockStore } from '@/app/passwordLockStore';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { proofBody, type ConfirmationProof } from './confirmationProof';

interface ChangePasswordPayload {
  proof: ConfirmationProof;
  newPassword: string;
}

async function changePassword({ proof, newPassword }: ChangePasswordPayload): Promise<void> {
  await apiClient.put('/users/me/password', { ...proofBody(proof), newPassword });
}

/**
 * Wraps `PUT /api/users/me/password` (backend `UserController.changePassword`, U24). The caller
 * proves who they are with exactly one of the current password (Keycloak checks it) or an emailed
 * code, and the new password is set in Keycloak. The session continues on success — other sessions
 * stay signed in (backend decision). `errorMessage` is the localized line and `errorCode` the
 * server code the dialog uses to place it (`CURRENT_PASSWORD_INCORRECT` on the password field,
 * `VERIFICATION_CODE_*` on the code field, `NEW_PASSWORD_REJECTED` on the new-password field).
 * `passwordLockSeconds` counts down a `PASSWORD_ATTEMPTS_EXCEEDED` lock (backend says
 * how many seconds remain); `reset` clears everything when the dialog closes.
 */
export function useChangePassword(options?: { onSuccess?: () => void }): {
  changePassword: (payload: ChangePasswordPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  passwordLockSeconds: number;
  reset: () => void;
} {
  const passwordLockSeconds = usePasswordLockStore((state) => state.secondsLeft);
  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: changePassword,
    onSuccess: () => options?.onSuccess?.(),
    onError: (error) => {
      const apiError = getApiError(error);
      const seconds = apiError.params?.seconds;
      if (apiError.code === 'PASSWORD_ATTEMPTS_EXCEEDED' && typeof seconds === 'number') {
        usePasswordLockStore.getState().lock(seconds);
      }
    },
  });

  return {
    changePassword: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    errorCode: mutation.error ? (getApiError(mutation.error).code ?? null) : null,
    passwordLockSeconds,
    reset: () => {
      mutation.reset();
    },
  };
}
