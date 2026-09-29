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
  /** CLIENT-I18N-6: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * PROFILE-10: confirms leaving the `/profile` Settings tab with unsaved sport-profile edits —
 * triggered by a `ProfileTabs` switch, a `SportSwitcher` pill click, or an in-app navigation
 * blocked by `useUnsavedChangesGuard`'s `useBlocker`. Same shape and copy pattern as `GroupsPage`'s
 * `SettingsUnsavedChangesDialog` (`features/groups/components/`) — not reused directly, since that
 * component's message text is hardcoded to "this group's settings". Does NOT cover the browser
 * close/refresh case — that can only ever show the browser's own generic native prompt.
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
  const t = useOverridableText('profilePage', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('unsaved.title')} className="mb-3" onCloseClick={onCancel} />
        <p className="mb-3 text-2sm text-text-secondary">
          {t('unsaved.message')}
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
