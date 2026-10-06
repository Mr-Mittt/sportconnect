import { getErrorMessage } from '@/shared/lib/apiError';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface PostActionErrorDialogProps {
  /** The raw failure to report; `null` keeps the dialog closed. Localized at render. */
  error: unknown;
  onDismiss: () => void;
  /** CLIENT-I18N-3: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * CLIENT-ERR-6: the pop-up for "this post no longer exists / you can't see it / you can't delete
 * it" — one message and a "Got it" button, same centered chrome as `JoinFeedbackDialog`. Hosted
 * once in `AppShell`, fed by `postErrorDialogStore`. The message is resolved here from the raw
 * failure, so a locale switch while it is open is picked up.
 */
export function PostActionErrorDialog({ error, onDismiss, i18nOverridePrefix }: PostActionErrorDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  const open = error !== null && error !== undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent centered className="p-4">
        <DialogTitle className="sr-only">{t('postActionError.title')}</DialogTitle>
        <p role="alert" className="mb-3 text-center text-sm font-medium text-text-primary">
          {open ? getErrorMessage(error) : null}
        </p>
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onDismiss} className="min-w-20">
            {t('postActionError.gotIt')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
