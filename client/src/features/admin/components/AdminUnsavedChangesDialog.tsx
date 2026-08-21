import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface AdminUnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}

/**
 * Confirms logging out of `/admin` while an admin form holds unsaved edits (ADMIN-4).
 *
 * Same confirm-dialog shape as `SettingsUnsavedChangesDialog`, minus its Save option:
 * two independent forms can be dirty at once here (sport fields and the attribute
 * schema), each with its own Save button and its own endpoint, so a single "Save"
 * action would have to fire both mutations and then decide what to do when one of them
 * fails. Discard-only sidesteps that entirely — the admin can cancel and save whichever
 * form they actually meant to save.
 */
export function AdminUnsavedChangesDialog({
  isOpen,
  onCancel,
  onDiscard,
}: AdminUnsavedChangesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="p-4">
        <DialogHeader title="Unsaved changes" className="mb-3" onCloseClick={onCancel} />
        <p className="mb-3 text-2sm text-text-secondary">
          Logging out will discard your unsaved admin edits.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onDiscard}>
            Discard &amp; log out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
