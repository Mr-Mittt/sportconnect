import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { usePasswordLockStore } from '@/app/passwordLockStore';
import { useAuthStore } from '@/app/authStore';
import { getApiError, getErrorMessage } from '@/shared/lib/apiError';
import { proofBody, type ConfirmationProof } from './confirmationProof';

async function deactivateAccount(proof: ConfirmationProof): Promise<void> {
  await apiClient.post('/users/me/deactivate', proofBody(proof));
}

/**
 * Wraps `POST /api/users/me/deactivate` (backend U22, U24) — the caller deactivates their own
 * account after proving who they are with exactly one of the current password (Keycloak checks it)
 * or an emailed code. The server soft-deletes the account, so on success this clears the local
 * session too and calls `onSuccess` (the shell navigates to `/login`, which sends the user to
 * Keycloak). `errorMessage` is the localized inline line and `errorCode` the server code the dialog
 * uses to place it; `passwordLockSeconds` counts down the shared `PASSWORD_ATTEMPTS_EXCEEDED`
 * lock (`passwordLockStore`: deactivate and change password share one backend allowance); `reset` clears everything when the dialog closes. The account comes back through the
 * re-activate dialog `/auth/callback` shows after the next sign-in (AUTH-14).
 */
export function useDeactivateAccount(options?: { onSuccess?: () => void }): {
  deactivate: (proof: ConfirmationProof) => void;
  isPending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  passwordLockSeconds: number;
  reset: () => void;
} {
  const clearSession = useAuthStore((state) => state.clearSession);
  const passwordLockSeconds = usePasswordLockStore((state) => state.secondsLeft);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: deactivateAccount,
    onSuccess: () => {
      clearSession();
      options?.onSuccess?.();
    },
    onError: (error) => {
      const apiError = getApiError(error);
      const seconds = apiError.params?.seconds;
      if (apiError.code === 'PASSWORD_ATTEMPTS_EXCEEDED' && typeof seconds === 'number') {
        usePasswordLockStore.getState().lock(seconds);
      }
    },
  });

  return {
    deactivate: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    errorCode: mutation.error ? (getApiError(mutation.error).code ?? null) : null,
    passwordLockSeconds,
    reset: () => {
      mutation.reset();
    },
  };
}
