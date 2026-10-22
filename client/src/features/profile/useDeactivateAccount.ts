import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { getErrorMessage } from '@/shared/lib/apiError';

async function deactivateAccount(currentPassword: string): Promise<void> {
  await apiClient.post('/users/me/deactivate', { currentPassword });
}

/**
 * Wraps `POST /api/users/me/deactivate` (backend U22) — the caller deactivates their own account
 * after re-entering their password. The server soft-deletes the account and revokes every session,
 * so on success this clears the local session too and calls `onSuccess` (the shell navigates to
 * `/login`, which sends the user to Keycloak). A wrong password is
 * `CURRENT_PASSWORD_INCORRECT`; `errorMessage` is its localized line (inline, in the dialog), and
 * `reset` clears it when the dialog closes. The account comes back through the re-activate dialog
 * `/auth/callback` shows after the next sign-in (AUTH-14).
 *
 * AUTH-14 dropped the "log in again to re-activate" hint this hook used to raise for the login form:
 * `/login` is now an immediate redirect to Keycloak, and the dialog explains re-activation when it
 * is needed. Open: users provisioned from Keycloak have no local password, see ACCOUNT-6 / backend U24.
 */
export function useDeactivateAccount(options?: { onSuccess?: () => void }): {
  deactivate: (currentPassword: string) => void;
  isPending: boolean;
  errorMessage: string | null;
  reset: () => void;
} {
  const clearSession = useAuthStore((state) => state.clearSession);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: deactivateAccount,
    onSuccess: () => {
      clearSession();
      options?.onSuccess?.();
    },
  });

  return {
    deactivate: mutation.mutate,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}
