import { create } from 'zustand';

interface SessionErrorDialogState {
  /** The raw failure being reported; null when the dialog is closed. Localized at render. */
  error: unknown;
  /** Bumped on every dismissal, so an open session modal can react without being the one that opened the dialog. */
  dismissals: number;
  /** Whether the most recent dismissal was of a 403 (the user has no right to be in the session modal). */
  lastDismissedForbidden: boolean;
  show: (error: unknown) => void;
  dismiss: (forbidden: boolean) => void;
}

/**
 * CLIENT-ERR-7: the "this session is gone / not yours / can't do that" error dialog. App-wide, not
 * per-page (same placement as `postErrorDialogStore`): a failed join, leave or approve can fire from
 * a card or the detail modal on any page, and `AppShell` renders the single dialog. Stores the raw
 * error (not text) so a locale switch while it is open is picked up. Not persisted.
 */
export const useSessionErrorDialogStore = create<SessionErrorDialogState>()((set) => ({
  error: null,
  dismissals: 0,
  lastDismissedForbidden: false,
  show: (error) => set({ error }),
  dismiss: (forbidden) =>
    set((state) => ({ error: null, dismissals: state.dismissals + 1, lastDismissedForbidden: forbidden })),
}));
