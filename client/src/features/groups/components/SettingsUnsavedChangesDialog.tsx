import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface SettingsUnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  isSaving: boolean;
  isSaveError: boolean;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * Confirms leaving the Settings tab with unsaved toggle changes (GRP-2) —
 * triggered by a tab/group switch, or an in-app navigation blocked by
 * `useSettingsUnsavedGuard`'s `useBlocker`. Same confirm-dialog shape as
 * `DeleteGroupConfirmDialog`. Does NOT cover the browser close/refresh case
 * — that can only ever show the browser's own generic native prompt.
 */
export function SettingsUnsavedChangesDialog({
  isOpen,
  onCancel,
  onDiscard,
  onSave,
  isSaving,
  isSaveError,
  i18nOverridePrefix,
}: SettingsUnsavedChangesDialogProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('unsaved.title')} className="mb-3" onCloseClick={onCancel} />
        <p className="mb-3 text-2sm text-text-secondary">
          {t('unsaved.body')}
        </p>
        {isSaveError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {t('unsaved.saveError')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={isSaving}>
            {t('unsaved.discard')}
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? t('unsaved.saving') : t('unsaved.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
