import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface FriendRequestUnavailableDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CLIENT-NOTIF-5 — shown when a friend-request notification is clicked but the
 * person it points at resolves to nobody on the Friends page: the request was
 * cancelled or declined elsewhere, or the account is no longer active. The
 * notification row is still marked read (the click already did that); this just
 * explains why `/friends` didn't open anyone. Same plain-copy-plus-dismiss shape
 * as `NoSportsToAddDialog`.
 */
export function FriendRequestUnavailableDialog({ isOpen, onClose }: FriendRequestUnavailableDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title="Friend request unavailable" className="mb-3" onCloseClick={onClose} />
        <p className="mb-3 text-2sm text-text-secondary">
          This friend request is no longer available. It may have been cancelled, or the account is no
          longer active.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
