import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiClient } from '@/app/apiClient';
import { useAuthStore } from '@/app/authStore';
import type { ApiResponse } from '@/shared/types/api';
import type { AuthResult } from './types';

async function refresh(): Promise<AuthResult> {
  const response = await apiClient.post<ApiResponse<AuthResult>>('/auth/refresh');
  return response.data.data;
}

/**
 * Restores the session from the httpOnly refresh cookie on app load — the
 * access token never survives a hard refresh (in-memory only, see
 * authStore), so this is what turns "cookie still valid" back into a logged-
 * in authStore state. Call once, at the app root (App.tsx), not per-page.
 *
 * A failed refresh (no cookie, expired, already revoked) is the normal
 * logged-out case — silently leaves authStore untouched, no visible error.
 * Either way, setBootstrapped() runs so ProtectedRoute (AUTH-4) knows the
 * check is done.
 *
 * The useRef guard exists because React 18 StrictMode double-invokes
 * mount effects in dev; without it this would fire two concurrent /refresh
 * calls sharing one single-use refresh token cookie. Harmless (the loser
 * just gets a 401 with no Set-Cookie — see AuthController.refreshToken),
 * but wasteful, so guarded to run exactly once per app lifetime regardless.
 */
export function useSessionBootstrap(): void {
  const setSession = useAuthStore((state) => state.setSession);
  const setBootstrapped = useAuthStore((state) => state.setBootstrapped);
  const hasBootstrapped = useRef(false);

  const mutation = useMutation({
    mutationFn: refresh,
    onSuccess: (result) => {
      setSession(result.user, result.accessToken);
    },
    onSettled: () => {
      setBootstrapped();
    },
  });

  const mutate = mutation.mutate;
  useEffect(() => {
    if (hasBootstrapped.current) {
      return;
    }
    hasBootstrapped.current = true;
    mutate();
  }, [mutate]);
}
