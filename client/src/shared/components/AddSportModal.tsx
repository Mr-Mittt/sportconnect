import type { SportKey } from '@/shared/types/sport';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { AddSportFields, type AddSportProfileSubmission } from './AddSportFields';

export type { AddSportProfileSubmission };

interface AddSportModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableSports: SportKey[];
  onSubmit: (payload: AddSportProfileSubmission) => void;
  isSubmitting: boolean;
  isError: boolean;
  /** A callout rendered above the Sport field — unset for the SportSwitcher "+" pill's normal
   * open, set when this modal is auto-triggered by the zero-sport-profile page-access gate
   * (CLIENT-SESSION-7 follow-up) on Groups/Matches. See `AddSportFields`' own doc comment. */
  promptMessage?: string;
}

/**
 * SPORT-1's "Add sport" flow, reached via SportSwitcher's dashed "+" pill. Presentational and
 * controlled, same shape as CreateGroupModal: the parent owns `useAddSportProfile()` and passes
 * `onSubmit`/`isSubmitting`/`isError` down. The fields themselves live in `AddSportFields`
 * (CLIENT-SESSION-7 follow-up extraction) — shared with the inline "you have zero sport
 * profiles" gate inside `CreateSessionModal`/`SessionDiscoverModal`.
 *
 * Resets on every *open* via a changing `key` prop from the parent (same reasoning as
 * CreateGroupModal — avoids a setState-in-effect reset).
 */
export function AddSportModal({
  isOpen,
  onClose,
  availableSports,
  onSubmit,
  isSubmitting,
  isError,
  promptMessage,
}: AddSportModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader title="Add a sport" className="border-hairline-b border-border px-4 py-3" />
        <AddSportFields
          availableSports={availableSports}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          isError={isError}
          promptMessage={promptMessage}
        />
      </DialogContent>
    </Dialog>
  );
}
