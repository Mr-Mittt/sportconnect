import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface AddSportIntroDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sportName: string;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.addSportIntro.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
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
  i18nOverridePrefix,
}: AddSportIntroDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('addSportIntro.title')} className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">
          {t('addSportIntro.body', { sportName })}
        </p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {t('addSportIntro.ok')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
