import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface UnfriendConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
  personName: string;
}

/**
 * Confirms `DELETE /api/users/friends/{friendId}` before firing it —
 * reachable only from `FriendProfilePanel`'s `Friend` menu. Deliberately
 * chrome-light (user decision): no header bar or close X, just the question
 * plus the two buttons, ordered **Unfriend then Cancel** (user decision —
 * the reverse of `DeleteGroupConfirmDialog`). `centered` forces the
 * viewport-centered position rather than anchoring below the Friends page's
 * pill row.
 *
 * On open, `onOpenAutoFocus` is prevented so **no button is focused** (user
 * decision) — Radix's default would focus the DOM-first `Unfriend` button,
 * and pre-focusing a destructive action invites a stray Enter. Radix still
 * traps Tab within the dialog and Escape still dismisses. The `DialogTitle`
 * is `sr-only` — Radix requires an accessible name; Escape, outside-click,
 * and Cancel all dismiss. Same confirm semantics as `DeleteGroupConfirmDialog`.
 */
export function UnfriendConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
  personName,
}: UnfriendConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        centered
        className="p-4"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Unfriend {personName}?</DialogTitle>
        <p className="mb-3 text-sm font-medium text-text-primary">
          Do you really want to unfriend {personName}?
        </p>
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            Couldn't unfriend {personName}. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {isSubmitting ? 'Unfriending…' : 'Unfriend'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
