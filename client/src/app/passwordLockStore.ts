import { create } from 'zustand';
import { useAuthStore } from './authStore';

interface PasswordLockState {
  /** Seconds left of the backend's wrong-password lock; `0` when the password may be tried. */
  secondsLeft: number;
  /** Starts (or restarts) the lock from the `seconds` the backend named in `PASSWORD_ATTEMPTS_EXCEEDED`. */
  lock: (seconds: number) => void;
  clear: () => void;
}

let endsAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * ACCOUNT-6: the wrong-password lock, shared by every dialog that confirms with the password.
 * The backend counts wrong passwords per user, not per action (deactivate and change password share
 * one allowance), so the client keeps one lock too: lock it in either dialog and the other opens
 * already locked, with the same countdown. In memory only (a reload may meet the 429 once more and
 * restarts it), and cleared when the signed-in user changes. The clock is read where the 429 is
 * handled, and a module-level timer ticks it, so no component reads the time while rendering.
 */
export const usePasswordLockStore = create<PasswordLockState>((set) => ({
  secondsLeft: 0,
  lock: (seconds) => {
    stopTimer();
    endsAt = Date.now() + seconds * 1000;
    set({ secondsLeft: Math.max(0, Math.ceil(seconds)) });
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      set({ secondsLeft: left });
      if (left === 0) stopTimer();
    }, 500);
  },
  clear: () => {
    stopTimer();
    endsAt = 0;
    set({ secondsLeft: 0 });
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) usePasswordLockStore.getState().clear();
});
