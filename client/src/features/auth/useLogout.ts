import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';

async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/**
 * Wraps POST /auth/logout — no body, no query param (see the auth module's
 * A3 ticket: the caller is derived from the Bearer header, already attached
 * by apiClient's request interceptor). Clears the session on settle
 * (success OR failure) so a user who can't reach the server isn't trapped
 * in a stuck "logged in" state — the whole point of logging out is to
 * become unauthenticated locally, regardless of whether the server-side
 * token revocation actually completes.
 */
export function useLogout(options?: { onSettled?: () => void }): {
  logout: () => void;
  isPending: boolean;
} {
  const clearSession = useAuthStore((state) => state.clearSession);

  const mutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearSession();
      options?.onSettled?.();
    },
  });

  return {
    logout: mutation.mutate,
    isPending: mutation.isPending,
  };
}
