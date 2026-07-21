import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface DeleteGroupConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  groupName: string;
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
}: DeleteGroupConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={`Delete ${groupName}?`} className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">
          This removes the group for every member. Posts and membership can't be recovered.
        </p>
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            Couldn't delete the group. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {isSubmitting ? 'Deleting…' : 'Delete group'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
