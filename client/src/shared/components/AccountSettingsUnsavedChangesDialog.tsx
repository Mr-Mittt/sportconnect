import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface AccountSettingsUnsavedChangesDialogProps {
  isOpen: boolean;
  /** Keep editing: the header close, Esc and an outside click all land here. */
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  isSaving: boolean;
  /** The localized save failure line (from the same save the modal's own Save button runs), if any. */
  saveErrorMessage: string | null;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-5: confirms closing `AccountSettingsModal` with unsaved edits. Same shape and copy pattern
 * as `features/profile/`'s `SettingsUnsavedChangesDialog` (not reused: its text is about a sport
 * profile). Stacks over the settings modal; Save runs the modal's own save, after which the parent
 * closes the whole modal.
 */
export function AccountSettingsUnsavedChangesDialog({
  isOpen,
  onCancel,
  onDiscard,
  onSave,
  isSaving,
  saveErrorMessage,
  i18nOverridePrefix,
}: AccountSettingsUnsavedChangesDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent centered className="p-4">
        <DialogHeader title={t('unsaved.title')} className="mb-3" onCloseClick={onCancel} />
        <p className="mb-3 text-2sm text-text-secondary">{t('unsaved.message')}</p>
        {saveErrorMessage !== null && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {saveErrorMessage}
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
