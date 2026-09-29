import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface FriendRequestUnavailableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** CLIENT-I18N-8: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * CLIENT-NOTIF-5 — shown when a friend-request notification is clicked but the
 * person it points at resolves to nobody on the Friends page: the request was
 * cancelled or declined elsewhere, or the account is no longer active. The
 * notification row is still marked read (the click already did that); this just
 * explains why `/friends` didn't open anyone. Same plain-copy-plus-dismiss shape
 * as `NoSportsToAddDialog`. `centered` — like `UnfriendConfirmDialog` — overrides
 * the Friends page's `ModalAnchorProvider` so this small notice sits dead-centre
 * rather than pinned below the pill row.
 */
export function FriendRequestUnavailableDialog({ isOpen, onClose, i18nOverridePrefix }: FriendRequestUnavailableDialogProps) {
  const t = useOverridableText('friends', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogHeader title={t('unavailableDialog.title')} className="mb-3" onCloseClick={onClose} />
        <p className="mb-3 text-2sm text-text-secondary">{t('unavailableDialog.body')}</p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('unavailableDialog.dismiss')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
