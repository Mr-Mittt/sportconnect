import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface SportProfileStatusConfirmDialogProps {
  isOpen: boolean;
  /** `deactivate` = currently active, about to be soft-deleted. `reactivate` = currently
   * inactive, about to be restored. */
  mode: 'deactivate' | 'reactivate';
  sportName: string;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isError: boolean;
}

/**
 * SPORT-10: confirms the profile Settings tab's Active toggle before it fires
 * `DELETE /api/sports/profiles/{id}` (deactivate) or `POST { sportId, isResume: true }`
 * (reactivate). Chrome-light, viewport-`centered`, no auto-focused button — same shape and
 * reasoning as `UnfriendConfirmDialog`.
 */
export function SportProfileStatusConfirmDialog({
  isOpen,
  mode,
  sportName,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
}: SportProfileStatusConfirmDialogProps) {
  const isDeactivate = mode === 'deactivate';
  const prompt = isDeactivate
    ? `Stop playing ${sportName} for a while?`
    : `Welcome back to ${sportName}!`;
  const confirmLabel = isDeactivate
    ? isSubmitting
      ? 'Deactivating…'
      : 'Deactivate'
    : isSubmitting
      ? 'Reactivating…'
      : 'Reactivate';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">{prompt}</DialogTitle>
        <p className="mb-3 text-sm font-medium text-text-primary">{prompt}</p>
        {isDeactivate && (
          <p className="mb-3 text-2sm text-text-secondary">
            It&apos;ll be hidden from your active sports, but your skill level, experience and
            attributes are kept — reactivate any time.
          </p>
        )}
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            Couldn&apos;t update {sportName}. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={
              isDeactivate ? 'border-text-danger text-text-danger hover:bg-bg-accent' : undefined
            }
          >
            {confirmLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
