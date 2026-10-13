import { create } from 'zustand';

interface AccountNoticeState {
  /** True from the moment the user deactivates their own account (ACCOUNT-4) until they next sign in:
   * `LoginPage` shows the "log in again to re-activate" hint while it is set. In memory only, like the
   * auth session itself — a hard refresh drops the hint, which is fine. */
  deactivated: boolean;
  setDeactivated: (deactivated: boolean) => void;
}

/**
 * One-shot notice carrier across the sign-out redirect. Router state cannot do this job: once the
 * session is cleared, `ProtectedRoute` redirects to `/login` itself and replaces whatever state an
 * earlier `navigate()` attached.
 */
export const useAccountNoticeStore = create<AccountNoticeState>((set) => ({
  deactivated: false,
  setDeactivated: (deactivated) => set({ deactivated }),
}));
