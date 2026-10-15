import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { getErrorMessage } from '@/shared/lib/apiError';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult, User } from './types';

async function reactivate(ticket: string): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/reactivate', { ticket });
  return response.data.data;
}

async function cancelReactivation(ticket: string): Promise<void> {
  await apiClient.post('/auth/reactivate/cancel', { ticket });
}

/**
 * AUTH-14: confirms or declines re-activation with the one-time `reactivationTicket` that
 * `POST /api/auth/callback` returned in `errorParams` for a deactivated password user (backend
 * A26). No password is involved — the ticket is the proof, works once and lives 5 minutes.
 *
 * `reactivate` runs `POST /auth/reactivate {ticket}` and, on success, populates authStore exactly
 * like a normal sign-in. A used or expired ticket is `REACTIVATION_TICKET_INVALID`; `errorMessage`
 * is its localized line and the user has to sign in again. `cancel` runs
 * `POST /auth/reactivate/cancel {ticket}` (always 200; it also ends the Keycloak session, so the
 * next sign-in does not loop back to the dialog) and then calls `onCancelled`.
 */
export function useReactivate(options?: { onSuccess?: (user: User) => void; onCancelled?: () => void }): {
  reactivate: (ticket: string) => void;
  cancel: (ticket: string) => void;
  isPending: boolean;
  errorMessage: string | null;
  reset: () => void;
} {
  const setSession = useAuthStore((state) => state.setSession);

  const confirmMutation = useMutation({
    meta: { errorDisplay: 'inline' },
    mutationFn: reactivate,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
      options?.onSuccess?.(result.user);
    },
  });

  const cancelMutation = useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: cancelReactivation,
    // Declining must always get the user out of the dialog, even if the call failed.
    onSettled: () => options?.onCancelled?.(),
  });

  return {
    reactivate: confirmMutation.mutate,
    cancel: cancelMutation.mutate,
    isPending: confirmMutation.isPending || cancelMutation.isPending,
    errorMessage: confirmMutation.error ? getErrorMessage(confirmMutation.error) : null,
    reset: confirmMutation.reset,
  };
}
