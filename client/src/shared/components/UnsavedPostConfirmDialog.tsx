import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface UnsavedPostConfirmDialogProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

/**
 * PROFILE-10: confirms leaving a page with unsubmitted `CreatePostForm` text — triggered by an
 * in-app navigation blocked by `useUnsavedChangesGuard`'s `useBlocker`. Unlike Settings'
 * `SettingsUnsavedChangesDialog`, there is no Save option — a post draft has nothing to persist,
 * so the only choice is stay and keep editing, or leave and lose it. Does NOT cover the browser
 * close/refresh case — that can only ever show the browser's own generic native prompt.
 */
export function UnsavedPostConfirmDialog({ isOpen, onStay, onLeave }: UnsavedPostConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onStay()}>
      <DialogContent className="p-4">
        <DialogHeader title="Leave without posting?" className="mb-3" onCloseClick={onStay} />
        <p className="mb-3 text-2sm text-text-secondary">
          You have an unsaved post draft. Leaving now will lose what you typed.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onStay}>
            Keep editing
          </Button>
          <Button variant="primary" size="sm" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
