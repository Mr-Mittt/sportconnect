import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface SportProfileStatusConfirmDialogProps {
  isOpen: boolean;
  /** `deactivate` = currently active, about to be soft-deleted. `reactivate` = currently
   * inactive, about to be restored. */
  mode: 'deactivate' | 'reactivate';
  sportName: string;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  /** CLIENT-I18N-6: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * SPORT-10: confirms the profile Settings tab's Active toggle before it fires
 * `DELETE /api/sports/profiles/{id}` (deactivate) or `POST { sportId, isResume: true }`
 * (reactivate). Chrome-light, viewport-`centered`, no auto-focused button — same shape and
 * reasoning as `UnfriendConfirmDialog`.
 */
export function SportProfileStatusConfirmDialog({
  isOpen,
  mode,
  sportName,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
  i18nOverridePrefix,
}: SportProfileStatusConfirmDialogProps) {
  const t = useOverridableText('profilePage', i18nOverridePrefix);
  const isDeactivate = mode === 'deactivate';
  const prompt = isDeactivate
    ? t('statusConfirm.deactivatePrompt', { sportName })
    : t('statusConfirm.reactivatePrompt', { sportName });
  const confirmLabel = isDeactivate
    ? isSubmitting
      ? t('statusConfirm.deactivating')
      : t('statusConfirm.deactivate')
    : isSubmitting
      ? t('statusConfirm.reactivating')
      : t('statusConfirm.reactivate');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">{prompt}</DialogTitle>
        <p className="mb-3 text-sm font-medium text-text-primary">{prompt}</p>
        {isDeactivate && (
          <p className="mb-3 text-2sm text-text-secondary">
            {t('statusConfirm.deactivateNote')}
          </p>
        )}
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {t('statusConfirm.error', { sportName })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={
              isDeactivate ? 'border-text-danger text-text-danger hover:bg-bg-accent' : undefined
            }
          >
            {confirmLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('statusConfirm.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
