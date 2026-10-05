import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { ResumablePrevious } from '@/shared/hooks/useResumableSports';
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
  /** CLIENT-ERR-4: a code-specific message (`getCodedErrorMessage`) shown instead of the static error line; unset keeps the static line. */
  errorText?: string;
  /** A callout rendered above the Sport field — unset for the SportSwitcher "+" pill's normal
   * open, set when this modal is auto-triggered by the zero-sport-profile page-access gate
   * (CLIENT-SESSION-7 follow-up) on Groups/Matches. See `AddSportFields`' own doc comment. */
  promptMessage?: string;
  /** SPORT-10: sports with a soft-deleted profile → their previous skill/YoE. When the selected
   * sport is one of these the modal renders the read-only "Reactivate" variant. */
  resumableProfiles?: Map<SportKey, ResumablePrevious>;
  /** SPORT-10: pre-select this sport (e.g. the Profile-page deactivated pill that opened this). */
  initialSport?: SportKey;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
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
 *
 * SPORT-10: `Cancel` in the reactivate state maps to `onClose`.
 */
export function AddSportModal({
  isOpen,
  onClose,
  availableSports,
  onSubmit,
  isSubmitting,
  isError,
  errorText,
  promptMessage,
  resumableProfiles,
  initialSport,
  i18nOverridePrefix,
}: AddSportModalProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader title={t('addSport.modalTitle')} className="border-hairline-b border-border px-4 py-3" />
        <AddSportFields
          availableSports={availableSports}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          isError={isError}
          errorText={errorText}
          promptMessage={promptMessage}
          resumableProfiles={resumableProfiles}
          onCancel={onClose}
          initialSport={initialSport}
          i18nOverridePrefix={i18nOverridePrefix}
        />
      </DialogContent>
    </Dialog>
  );
}
