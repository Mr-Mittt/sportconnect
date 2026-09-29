import { useState } from 'react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

interface RejectInvitationConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  isError: boolean;
  groupName: string;
  /** CLIENT-I18N-7: `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * GRP-8 part 2 — confirms rejecting a group invitation, with an optional
 * reason (user decision: not required — Reject stays enabled with an empty
 * reason, unlike a required-field gate). Same Dialog/DialogContent/
 * DialogHeader shape as `DeleteGroupConfirmDialog`. Owns its own transient
 * `reason` field state, reset on every *open* via the parent passing a
 * changing `key` (the invitation id) — same convention as `AddSportModal`/
 * `CreateGroupModal`.
 */
export function RejectInvitationConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  isError,
  groupName,
  i18nOverridePrefix,
}: RejectInvitationConfirmDialogProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const [reason, setReason] = useState('');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={t('reject.title', { groupName })} className="mb-3" />
        <div className="mb-3">
          <Label htmlFor="reject-invitation-reason">{t('reject.reason')}</Label>
          <Textarea
            id="reject-invitation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reject.reasonPlaceholder')}
            maxLength={500}
          />
        </div>
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {t('reject.error')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('reject.cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfirm(reason)}
            disabled={isSubmitting}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {isSubmitting ? t('reject.submitting') : t('reject.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
