import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import { getApiError } from '@/shared/lib/apiError';

async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/**
 * Wraps POST /auth/logout — no body: since backend A26 the endpoint is public and driven by the
 * httpOnly refresh cookie (no Bearer needed, so it works with an expired access token).
 *
 * Clears the session and calls `onSignedOut` when the call succeeds, and also when it fails for any
 * reason except one: a `503 SERVICE_UNAVAILABLE` means Keycloak could not be reached, and the
 * backend then **keeps the refresh cookie** — so clearing locally would be a false sign-out (the
 * next load, or Keycloak's own session, signs the user straight back in). On a 503 the session
 * stays and `failed` turns true, so the caller can offer "Try again" (`logout` again) or "Stay
 * signed in" (`dismissFailure`). AUTH-14.
 */
export function useLogout(options?: { onSignedOut?: () => void }): {
  logout: () => void;
  isPending: boolean;
  failed: boolean;
  dismissFailure: () => void;
} {
  const clearSession = useAuthStore((state) => state.clearSession);

  const signOut = () => {
    clearSession();
    options?.onSignedOut?.();
  };

  const mutation = useMutation({
    meta: { errorDisplay: 'silent' },
    mutationFn: logout,
    onSuccess: signOut,
    onError: (error) => {
      if (getApiError(error).status !== 503) signOut();
    },
  });

  return {
    logout: mutation.mutate,
    isPending: mutation.isPending,
    failed: mutation.isError && getApiError(mutation.error).status === 503,
    dismissFailure: mutation.reset,
  };
}
