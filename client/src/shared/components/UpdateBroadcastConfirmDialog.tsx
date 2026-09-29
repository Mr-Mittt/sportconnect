import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface UpdateBroadcastConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  /** The selected group's current active broadcast message, shown for
   * context so the admin knows what they're about to replace. */
  existingText: string;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.updateBroadcast.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
}

/**
 * FEED-7: the backend caps each group at one active broadcast at a time
 * (`POST /api/posts` 400s with "This group already has an active broadcast"
 * for a second attempt). Rather than let that 400 surprise an owner/admin
 * mid-submit, `GroupsPage` detects the cap client-side (it already has every
 * active broadcast via `useActiveBroadcasts`) and opens this confirmation
 * instead of calling create — confirming calls `useUpdatePost` against the
 * existing broadcast's id (user decision).
 */
export function UpdateBroadcastConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
  existingText,
  i18nOverridePrefix,
}: UpdateBroadcastConfirmDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('updateBroadcast.title')} className="mb-3" />
        <p className="mb-2 text-2sm text-text-secondary">{t('updateBroadcast.body')}</p>
        <p className="border-hairline mb-3 rounded-lg border-border bg-surface-1 p-2.5 text-2sm text-text-primary">
          {existingText}
        </p>
        {isError && (
          <p className="mb-2 text-2sm text-text-danger">{t('updateBroadcast.error')}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('updateBroadcast.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t('updateBroadcast.updating') : t('updateBroadcast.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
