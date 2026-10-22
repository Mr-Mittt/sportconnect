import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface ReactivateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  /** Localized line for a failed re-activation (e.g. an expired ticket); the dialog stays open. */
  errorMessage: string | null;
}

/**
 * AUTH-10, reworked by AUTH-14: shown by `/auth/callback` after the sign-in answered
 * `ACCOUNT_DEACTIVATED` with a one-time ticket. Confirm re-activates with that ticket (the page
 * holds it, this component never sees it — no password is involved); Cancel, the close action and
 * Esc call `onClose`, which declines the ticket.
 */
export function ReactivateAccountDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  errorMessage,
}: ReactivateAccountDialogProps) {
  const { t } = useTranslation('login');
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t('reactivate.title')}</DialogTitle>
        <p className="mt-1 mb-3 text-2sm text-text-secondary">
          {t('reactivate.body')}
        </p>
        {errorMessage && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? t('reactivate.confirming') : t('reactivate.confirm')}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('reactivate.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
