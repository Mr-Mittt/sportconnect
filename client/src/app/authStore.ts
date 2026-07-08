import { create } from 'zustand';
import type { User } from '@/features/auth/types';

interface AuthState {
  user: User | null;
  /** In-memory only — deliberately no persist middleware. Lost on hard
   * refresh by design; AUTH-3's session bootstrap re-acquires it via the
   * httpOnly refresh cookie, never by reading it back from storage. */
  accessToken: string | null;
  /** True until AUTH-3's initial refresh-on-load check resolves. Not yet
   * flipped by anything in this ticket — ProtectedRoute (AUTH-4) will read
   * it once AUTH-3 exists. */
  isBootstrapping: boolean;
  setSession: (user: User, accessToken: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isBootstrapping: true,
  setSession: (user, accessToken) => set({ user, accessToken }),
  clearSession: () => set({ user: null, accessToken: null }),
}));
