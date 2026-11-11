import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { getSessionStatusLabel } from '@/shared/lib/sessionStatus';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { MissingField } from '../sessionReadiness';

interface AutoApproveConfirmDialogProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * CLIENT-SESSION-34: ticking "Auto approve join request" opens this instead of checking the box;
 * "Turn on" checks it, "Cancel" (or Escape) leaves it unchecked. Unticking opens nothing. A sibling
 * `Dialog` of the form (never nested in it), modelled on `UnfriendConfirmDialog`: centred, nothing
 * pre-focused, and Radix restores focus to the checkbox on close.
 */
export function AutoApproveConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  i18nOverridePrefix,
}: AutoApproveConfirmDialogProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="mb-1 text-sm font-semibold text-text-primary">
          {t('create.autoApproveConfirm.title')}
        </DialogTitle>
        <p className="mb-3 text-2sm text-text-secondary">{t('create.autoApproveConfirm.body')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t('create.autoApproveConfirm.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {t('create.autoApproveConfirm.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SessionReadinessDialogProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  isOpen: boolean;
  /** Still missing for scheduling; empty = the complete variant. */
  missing: MissingField[];
  /** "Continue editing" / "Let me check again". */
  onBack: () => void;
  /** "Create preparing session" / "Let's go". */
  onConfirm: () => void;
  isSubmitting?: boolean;
  /** Inline error line under the text (a failed schedule, etc.). */
  errorText?: string;
}

/**
 * CLIENT-SESSION-34: the "Are you ready?" popup. Incomplete (anything missing): lists what is
 * missing and says the session will be Preparing until it is completed — "Continue editing" /
 * "Create preparing session". Complete: the session is ready to be Scheduled and its details can't
 * be edited afterwards — "Let me check again" / "Let's go". Used after the create form's submit
 * validation, by the detail modal's "Mark it scheduled" button, and opened by itself when the host
 * saves the last missing field. Sibling `Dialog`, same behaviour as `AutoApproveConfirmDialog`.
 */
export function SessionReadinessDialog({
  isOpen,
  missing,
  onBack,
  onConfirm,
  isSubmitting = false,
  errorText,
  i18nOverridePrefix,
}: SessionReadinessDialogProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const isComplete = missing.length === 0;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onBack()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="mb-1 text-sm font-semibold text-text-primary">{t('readiness.title')}</DialogTitle>
        {isComplete ? (
          <p className="mb-3 text-2sm text-text-secondary">
            {t('readiness.complete.body', { scheduled: getSessionStatusLabel('SCHEDULED') })}
          </p>
        ) : (
          <>
            <p className="mb-2 text-2sm text-text-secondary">
              {t('readiness.incomplete.body', { preparing: getSessionStatusLabel('PREPARING') })}
            </p>
            <ul className="mb-3 ml-5 list-disc text-2sm text-text-primary">
              {missing.map((field) => (
                <li key={field}>{t(`readiness.missing.${field}`)}</li>
              ))}
            </ul>
          </>
        )}
        {errorText !== undefined && (
          <p role="alert" className="mb-2 text-2xs text-text-danger">
            {errorText}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={isSubmitting}>
            {isComplete ? t('readiness.complete.back') : t('readiness.incomplete.back')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting
              ? t('readiness.working')
              : isComplete
                ? t('readiness.complete.confirm')
                : t('readiness.incomplete.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface LeaveWithoutSavingDialogProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  isOpen: boolean;
  /** "Keep editing" (also Escape): back to the form, nothing lost. */
  onStay: () => void;
  /** "Leave": close the create form and drop what was entered. */
  onLeave: () => void;
}

/**
 * CLIENT-SESSION-34: shown when the create form is closed (click outside, Escape, the X) while it holds
 * entries that were not saved — nothing is sent until "Create session", so leaving would lose them.
 * A sibling `Dialog` like the other two confirmations (centred, nothing pre-focused). "Keep editing" is the
 * safe default: it is the primary button, and Escape and a click outside both choose it.
 */
export function LeaveWithoutSavingDialog({
  isOpen,
  onStay,
  onLeave,
  i18nOverridePrefix,
}: LeaveWithoutSavingDialogProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onStay()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="mb-1 text-sm font-semibold text-text-primary">{t('create.leave.title')}</DialogTitle>
        <p className="mb-3 text-2sm text-text-secondary">{t('create.leave.body')}</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLeave}
            className="border-text-danger text-text-danger hover:bg-bg-accent"
          >
            {t('create.leave.leave')}
          </Button>
          <Button variant="primary" size="sm" onClick={onStay}>
            {t('create.leave.stay')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
