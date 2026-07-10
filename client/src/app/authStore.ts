import { create } from 'zustand';
import type { User } from '@/features/auth/types';

interface AuthState {
  user: User | null;
  /** In-memory only — deliberately no persist middleware. Lost on hard
   * refresh by design; AUTH-3's session bootstrap re-acquires it via the
   * httpOnly refresh cookie, never by reading it back from storage. */
  accessToken: string | null;
  /** True until AUTH-3's initial refresh-on-load check resolves (see
   * useSessionBootstrap). ProtectedRoute (AUTH-4) reads this to avoid
   * redirecting to /login before the check has had a chance to run. */
  isBootstrapping: boolean;
  setSession: (user: User, accessToken: string) => void;
  clearSession: () => void;
  /** Flips isBootstrapping to false. Called once the initial refresh check
   * settles, whether it succeeded (session restored) or failed (normal
   * logged-out case) — either way there's nothing left to wait for. */
  setBootstrapped: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isBootstrapping: true,
  setSession: (user, accessToken) => set({ user, accessToken }),
  clearSession: () => set({ user: null, accessToken: null }),
  setBootstrapped: () => set({ isBootstrapping: false }),
}));
