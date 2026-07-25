import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface AddSportIntroDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sportName: string;
}

/**
 * GRP-8 part 5 — a plain heads-up before `AddSportModal` opens for the
 * "accepting this invitation adds a sport profile" flow: explanatory copy
 * plus a single "OK" button (not a Confirm/Cancel pair — user decision, kept
 * decoupled from `AddSportModal`'s own form rather than a `note` prop on
 * it). Dismissing without clicking OK (the dialog's own close control) is
 * the same as cancelling — the invitation stays untouched either way.
 */
export function AddSportIntroDialog({
  isOpen,
  onClose,
  onConfirm,
  sportName,
}: AddSportIntroDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title="Add this sport to your profile?" className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">
          This {sportName} group — accepting this invitation will add this sport to your profile.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onConfirm}>
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
