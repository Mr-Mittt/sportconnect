import { create } from 'zustand';

interface PostErrorDialogState {
  /** The raw failure being reported; null when the pop-up is closed. Localized at render. */
  error: unknown;
  /** Bumped on every dismissal, so a page can react (close its comments modal) without being the one that opened the pop-up. */
  dismissals: number;
  show: (error: unknown) => void;
  dismiss: () => void;
}

/**
 * CLIENT-ERR-6: the "this post is gone / not yours" error pop-up. App-wide, not per-page (same
 * placement as `joinFeedbackStore`): a failed like, comment or delete can fire from a feed card,
 * the comments modal or the hashtag modal on any of three pages, and `AppShell` renders the single
 * `PostActionErrorDialog`. Stores the raw error (not text) so a locale switch while it is open is
 * picked up. Not persisted: a pop-up is a moment, not a setting.
 */
export const usePostErrorDialogStore = create<PostErrorDialogState>()((set) => ({
  error: null,
  dismissals: 0,
  show: (error) => set({ error }),
  dismiss: () => set((state) => ({ error: null, dismissals: state.dismissals + 1 })),
}));
