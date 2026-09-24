import type { JoinFeedbackKind } from '@/app/joinFeedbackStore';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface JoinFeedbackDialogProps {
  /** Which message to show; null keeps the dialog closed. */
  kind: JoinFeedbackKind | null;
  onDismiss: () => void;
  /** When provided, an "Open session" button is shown next to "Got it" — the join came from a
   * session card, so the caller can jump straight into that session's detail. */
  onOpenSession?: () => void;
}

const MESSAGE: Record<JoinFeedbackKind, { title: string; body: string }> = {
  JOINED: {
    title: 'You joined the session',
    body: 'You successfully joined the session. Enjoy your games!',
  },
  REQUESTED: {
    title: 'Join request sent',
    body: 'Waiting for host approval. Feel free to chat while you wait.',
  },
};

/**
 * CLIENT-SESSION-30: the information pop-up shown after a session join — "joined" for an
 * auto-approve session (or an accepted invitation), "request sent" when the host has to approve.
 * No visible title by design (the title is `sr-only`, still required by Radix for screen readers),
 * just the centered message and centered, background-less (`ghost`) buttons: "Got it", plus
 * "Open session" when `onOpenSession` is passed (join fired from a card). Centered dialog, same
 * chrome as `ReactivateSportNudgeDialog`. Hosted once in `AppShell`, fed by `joinFeedbackStore`.
 */
export function JoinFeedbackDialog({ kind, onDismiss, onOpenSession }: JoinFeedbackDialogProps) {
  const message = kind !== null ? MESSAGE[kind] : null;

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent centered className="p-4">
        <DialogTitle className="sr-only">{message?.title}</DialogTitle>
        <p className="mb-3 text-center text-sm font-medium text-text-primary">{message?.body}</p>
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} className="min-w-20">
            Got it
          </Button>
          {onOpenSession !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSession}
              className="min-w-20 text-text-accent hover:text-text-accent"
            >
              Open session
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
