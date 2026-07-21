import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface SettingsUnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
  isSaving: boolean;
  isSaveError: boolean;
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
}: SettingsUnsavedChangesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogClose aria-label="Close" onClick={onCancel} />
        </div>
        <p className="mb-3 text-2sm text-text-secondary">
          You have unsaved changes to this group's settings. Discard them, or save before leaving?
        </p>
        {isSaveError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            Couldn't save settings. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={isSaving}>
            Discard changes
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
