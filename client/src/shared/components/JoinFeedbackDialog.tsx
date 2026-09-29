import type { JoinFeedbackKind } from '@/app/joinFeedbackStore';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface JoinFeedbackDialogProps {
  /** Which message to show; null keeps the dialog closed. */
  kind: JoinFeedbackKind | null;
  onDismiss: () => void;
  /** When provided, an "Open session" button is shown next to "Got it" — the join came from a
   * session card, so the caller can jump straight into that session's detail. */
  onOpenSession?: () => void;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.joinFeedback.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
}

const MESSAGE_KEY: Record<JoinFeedbackKind, { title: string; body: string }> = {
  JOINED: { title: 'joinFeedback.joined.title', body: 'joinFeedback.joined.body' },
  REQUESTED: { title: 'joinFeedback.requested.title', body: 'joinFeedback.requested.body' },
};

/**
 * CLIENT-SESSION-30: the information pop-up shown after a session join — "joined" for an
 * auto-approve session (or an accepted invitation), "request sent" when the host has to approve.
 * No visible title by design (the title is `sr-only`, still required by Radix for screen readers),
 * just the centered message and centered, background-less (`ghost`) buttons: "Got it", plus
 * "Open session" when `onOpenSession` is passed (join fired from a card). Centered dialog, same
 * chrome as `ReactivateSportNudgeDialog`. Hosted once in `AppShell`, fed by `joinFeedbackStore`.
 */
export function JoinFeedbackDialog({
  kind,
  onDismiss,
  onOpenSession,
  i18nOverridePrefix,
}: JoinFeedbackDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  const messageKey = kind !== null ? MESSAGE_KEY[kind] : null;

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent centered className="p-4">
        <DialogTitle className="sr-only">{messageKey && t(messageKey.title)}</DialogTitle>
        <p className="mb-3 text-center text-sm font-medium text-text-primary">
          {messageKey && t(messageKey.body)}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} className="min-w-20">
            {t('joinFeedback.gotIt')}
          </Button>
          {onOpenSession !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSession}
              className="min-w-20 text-text-accent hover:text-text-accent"
            >
              {t('joinFeedback.openSession')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
