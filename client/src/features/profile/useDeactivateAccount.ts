import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { useAccountNoticeStore } from '@/features/auth/accountNoticeStore';
import { getErrorMessage } from '@/shared/lib/apiError';

async function deactivateAccount(currentPassword: string): Promise<void> {
  await apiClient.post('/users/me/deactivate', { currentPassword });
}

/**
 * Wraps `POST /api/users/me/deactivate` (backend U22) — the caller deactivates their own account
 * after re-entering their password. The server soft-deletes the account and revokes every session,
 * so on success this raises the "deactivated" login notice (`accountNoticeStore` — router state cannot
 * carry it, `ProtectedRoute` replaces it), clears the local session too and calls `onSuccess` (the
 * shell navigates to `/login`). A wrong password is
 * `CURRENT_PASSWORD_INCORRECT`; `errorMessage` is its localized line (inline, in the dialog), and
 * `reset` clears it when the dialog closes. The account can come back through the login page's
 * re-activate offer (AUTH-10).
 */
export function useDeactivateAccount(options?: { onSuccess?: () => void }): {
  deactivate: (currentPassword: string) => void;
  isPending: boolean;
  errorMessage: string | null;
  reset: () => void;
} {
  const clearSession = useAuthStore((state) => state.clearSession);
  const setDeactivatedNotice = useAccountNoticeStore((state) => state.setDeactivated);

  const mutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: deactivateAccount,
    onSuccess: () => {
      setDeactivatedNotice(true);
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
