import { create } from 'zustand';

/** What the caller's join resolved to: straight in (`JOINED`) or waiting on the host (`REQUESTED`). */
export type JoinFeedbackKind = 'JOINED' | 'REQUESTED';

interface JoinFeedbackState {
  /** Which information pop-up is open — null when none. */
  kind: JoinFeedbackKind | null;
  /** The joined session's id when the pop-up should offer an "Open session" button (the join came
   * from a session card, so the detail isn't already open); null when there is nothing to open. */
  openSessionId: number | null;
  show: (kind: JoinFeedbackKind, openSessionId?: number | null) => void;
  dismiss: () => void;
}

/**
 * CLIENT-SESSION-30: the "You joined" / "Request sent" information pop-up after a successful
 * session join. App-wide, not per-page — a join can fire from a card on any page or from a
 * detail modal, so `useJoinSession` (the one hook every join goes through) sets this and
 * `AppShell` renders the single `JoinFeedbackDialog`. Not persisted: a pop-up is a moment, not a
 * setting, so a reload must never bring it back.
 */
export const useJoinFeedbackStore = create<JoinFeedbackState>()((set) => ({
  kind: null,
  openSessionId: null,
  show: (kind, openSessionId = null) => set({ kind, openSessionId }),
  dismiss: () => set({ kind: null, openSessionId: null }),
}));
