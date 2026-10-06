import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface GroupActionErrorDialogProps {
  /** The localized failure text; `null` keeps the dialog closed. */
  message: string | null;
  onDismiss: () => void;
  /** CLIENT-I18N-3: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * CLIENT-ERR-5: the one error pop-up for the group list actions that have no dialog of their own
 * (accept/decline/approve/cancel a join request or invitation, accept an invitation). The caller
 * resolves `message` from the failure (`getErrorMessage`) at render time, so a locale switch while
 * it is open is picked up. Same centered chrome as `JoinFeedbackDialog`; the list underneath is
 * already refetching by the time the user reads this (each mutation invalidates on settle).
 */
export function GroupActionErrorDialog({
  message,
  onDismiss,
  i18nOverridePrefix,
}: GroupActionErrorDialogProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent centered className="p-4">
        <DialogTitle className="sr-only">{t('actionError.title')}</DialogTitle>
        <p role="alert" className="mb-3 text-center text-sm font-medium text-text-primary">
          {message}
        </p>
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onDismiss} className="min-w-20">
            {t('actionError.gotIt')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
