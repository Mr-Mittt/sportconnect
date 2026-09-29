import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface DeleteGroupConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  groupName: string;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * Confirms `DELETE /api/groups/{groupId}` before firing it — owner-only,
 * irreversible (soft delete server-side, but not something to trigger on a
 * misclick). Same confirm-dialog shape as `UpdateBroadcastConfirmDialog`.
 */
export function DeleteGroupConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
  groupName,
  i18nOverridePrefix,
}: DeleteGroupConfirmDialogProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('deleteGroup.title', { groupName })} className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">
          {t('deleteGroup.body')}
        </p>
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {t('deleteGroup.error')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('deleteGroup.cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {isSubmitting ? t('deleteGroup.submitting') : t('deleteGroup.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
