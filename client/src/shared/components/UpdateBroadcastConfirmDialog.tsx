import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface UpdateBroadcastConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  /** The selected group's current active broadcast message, shown for
   * context so the admin knows what they're about to replace. */
  existingText: string;
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
}: UpdateBroadcastConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <DialogTitle>Update the active broadcast?</DialogTitle>
          <DialogClose aria-label="Close" />
        </div>
        <p className="mb-2 text-2sm text-text-secondary">
          This group already has an active broadcast. Posting a new one will replace it instead of
          creating a second broadcast:
        </p>
        <p className="border-hairline mb-3 rounded-lg border-border bg-surface-1 p-2.5 text-2sm text-text-primary">
          {existingText}
        </p>
        {isError && (
          <p className="mb-2 text-2sm text-text-danger">
            Couldn't update the broadcast. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Update broadcast'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
