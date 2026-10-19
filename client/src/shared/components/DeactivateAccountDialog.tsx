import { isProofFieldError, type ConfirmationProof } from '@/features/profile/confirmationProof';
import type { CodeSender } from '@/features/profile/useConfirmationCode';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { ConfirmationProofFields } from './ConfirmationProofFields';
import { useConfirmationProofState } from './useConfirmationProofState';

interface DeactivateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the one proof the user chose (password or emailed code); the parent fires `POST /users/me/deactivate`. */
  onConfirm: (proof: ConfirmationProof) => void;
  isSubmitting: boolean;
  /** Localized line for a failed deactivation (wrong password or code…); the dialog stays open. */
  errorMessage: string | null;
  /** The failed request's server code, used to place `errorMessage` (on the password, on the code, or general). */
  errorCode?: string | null;
  /** False for an account with no email (phone-only): the emailed-code method is disabled. */
  hasEmail?: boolean;
  /** The "verify by email" method (from `useConfirmationCode('DEACTIVATE')`). */
  codeSender: CodeSender;
  /** Seconds left of a `PASSWORD_ATTEMPTS_EXCEEDED` lock (counted down by the hook); `0` when none. */
  passwordLockSeconds?: number;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-4, ACCOUNT-6: confirms deactivating the caller's own account. The user proves who they
 * are with the current password (Keycloak checks it) or a code emailed to the account, chosen by a
 * radio (`ConfirmationProofFields`); Deactivate stays disabled until the chosen method is filled in.
 * `AppShell` mounts this only while open, so the typed password and code are dropped on every close.
 *
 * The password field must start empty: this is a re-confirmation, so a browser filling in the saved
 * password would let the user confirm without typing anything (the field handles that itself).
 */
export function DeactivateAccountDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  errorMessage,
  errorCode = null,
  hasEmail = true,
  codeSender,
  passwordLockSeconds = 0,
  i18nOverridePrefix,
}: DeactivateAccountDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const state = useConfirmationProofState({ hasEmail, errorCode, passwordLockSeconds });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t('deactivateDialog.title')}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (state.isComplete) onConfirm(state.proof());
          }}
        >
          <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('deactivateDialog.body')}</p>
          <ConfirmationProofFields
            idPrefix="deactivate-account"
            method={state.method}
            onMethodChange={state.setMethod}
            password={state.password}
            onPasswordChange={state.setPassword}
            code={state.code}
            onCodeChange={state.setCode}
            passwordLabel={t('deactivateDialog.passwordLabel')}
            hasEmail={hasEmail}
            codeSender={codeSender}
            passwordLockSeconds={state.lockSeconds}
            errorCode={errorCode}
            errorMessage={errorMessage}
            i18nOverridePrefix={i18nOverridePrefix}
          />
          {errorMessage !== null && !isProofFieldError(errorCode) && (
            <p role="alert" className="mt-2 text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!state.isComplete || isSubmitting}
              className="border-text-danger text-text-danger hover:bg-bg-accent"
            >
              {isSubmitting ? t('deactivateDialog.submitting') : t('deactivateDialog.submit')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t('deactivateDialog.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
