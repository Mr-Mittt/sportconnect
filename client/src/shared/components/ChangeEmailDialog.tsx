import { useState } from 'react';
import { CODE_LENGTH, digitsOf, isCodeProofError, isDeadCodeError, isProofFieldError, type ConfirmationProof } from '@/features/profile/confirmationProof';
import type { EmailCodeSubject } from '@/features/profile/useChangeEmail';
import type { CodeSender } from '@/features/profile/useConfirmationCode';
import type { NewEmailCodeSender } from '@/features/profile/useEmailChangeCode';
import { formatCountdown } from '@/shared/lib/useCountdown';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ConfirmationProofFields } from './ConfirmationProofFields';
import { useConfirmationProofState } from './useConfirmationProofState';

/** Server codes about the address itself: shown under the address input, and they close the code step. */
function isAddressError(code: string | null): boolean {
  return code === 'EMAIL_ALREADY_REGISTERED' || code === 'NEW_EMAIL_SAME_AS_CURRENT';
}

interface ChangeEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The account's address today; `null` for a phone-only account, whose dialog reads "Add email" and proves with a password. */
  currentEmail: string | null;
  /** Receives both codes and the caller's one proof once the form is complete; the parent fires `PUT /users/me/email`. */
  onSubmit: (payload: { newEmail: string; newEmailCode: string; proof: ConfirmationProof }) => void;
  isSubmitting: boolean;
  /** Localized line for the failed `PUT`; the dialog stays open and keeps what was typed unless the answer makes it useless. */
  errorMessage: string | null;
  /** The failed `PUT`'s server code, used to place `errorMessage`. */
  errorCode?: string | null;
  /** Which code a `VERIFICATION_CODE_*` answer is about (`errorParams.purpose`). */
  codeSubject?: EmailCodeSubject | null;
  /** Seconds left of a `PASSWORD_ATTEMPTS_EXCEEDED` lock; `0` when none. */
  passwordLockSeconds?: number;
  /** The code mailed to the **current** address (`useConfirmationCode('CHANGE_EMAIL')`). */
  codeSender: CodeSender;
  /** The Verify step: a code mailed to the **new** address. */
  newEmailSender: NewEmailCodeSender;
  /** Drops the parent's stale `PUT` error (called when the address is edited or Verify is pressed). */
  onClearError: () => void;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-7: changes the account's email (backend U26). Three parts, top to bottom: the caller's
 * proof (`ConfirmationProofFields`: the current password, or a code mailed to the current address),
 * the new address with a Verify button that mails a code to it (becomes "Re-send in m:ss", and the
 * 6-digit input appears beside it), and Update email, enabled only when the address was verified-by-send,
 * its code has six digits and the proof is filled. What the dialog does with each refusal (owner, 2026-10-21):
 * - `EMAIL_ALREADY_REGISTERED` on the `PUT`: the server dropped the new-address code, so the typed code
 *   is cleared and the code step closes; the line shows under the address, and the proof stays.
 * - Verify / Re-send: clears the typed new-address code and the caller's proof (a password or a typed
 *   code), so a resend always starts the proof from empty; re-sending the current-address code clears its input too.
 * - any other refusal keeps the inputs next to the line; an expired or burned code is emptied because a new one is needed.
 * - a 503 keeps every input (the server kept both codes) and shows the shared "try again later" line.
 * `AppShell` mounts this only while open, so typed passwords and codes are dropped on every close.
 */
export function ChangeEmailDialog({
  isOpen,
  onClose,
  currentEmail,
  onSubmit,
  isSubmitting,
  errorMessage,
  errorCode = null,
  codeSubject = null,
  passwordLockSeconds = 0,
  codeSender,
  newEmailSender,
  onClearError,
  i18nOverridePrefix,
}: ChangeEmailDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const hasEmail = currentEmail !== null;
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [seenErrorCode, setSeenErrorCode] = useState<string | null>(errorCode);

  // A code error is about one of the two codes. The backend says which; if an old backend does not, a password proof leaves only the new-address code.
  const proofState = useConfirmationProofState({
    hasEmail,
    // Not wired: the hook would empty the proof code for any dead code, but here the dead code may be the new-address one (handled below).
    errorCode: null,
    passwordLockSeconds,
  });
  const subject: EmailCodeSubject | null = isCodeProofError(errorCode)
    ? (codeSubject ?? (proofState.method === 'password' ? 'NEW_EMAIL' : 'CHANGE_EMAIL'))
    : null;
  const proofErrorCode = subject === 'NEW_EMAIL' ? null : errorCode;
  const newCodeError = subject === 'NEW_EMAIL' ? errorMessage : null;

  // Adjusting state while rendering (not in an effect) so there is no frame with a stale value.
  if (errorCode !== seenErrorCode) {
    setSeenErrorCode(errorCode);
    if (errorCode === 'EMAIL_ALREADY_REGISTERED' || (subject === 'NEW_EMAIL' && isDeadCodeError(errorCode))) {
      setNewCode('');
    }
    if (subject === 'CHANGE_EMAIL' && isDeadCodeError(errorCode)) {
      proofState.setCode('');
    }
  }

  const addressError = isAddressError(errorCode) ? errorMessage : newEmailSender.errorMessage;
  const isCodeStepOpen = newEmailSender.hasSent && !isAddressError(errorCode);
  const canVerify =
    newEmail.trim() !== '' && !newEmailSender.isSending && newEmailSender.resendSecondsLeft === 0 && !isSubmitting;
  const isComplete = proofState.isComplete && isCodeStepOpen && digitsOf(newCode).length === CODE_LENGTH;

  const changeAddress = (value: string) => {
    setNewEmail(value);
    setNewCode('');
    newEmailSender.closeCodeStep();
    onClearError();
  };
  const verify = () => {
    setNewCode('');
    proofState.clearInputs();
    onClearError();
    newEmailSender.send(newEmail);
  };
  // Re-sending the code of the current address empties its own input, the same rule as the new-address one.
  const proofCodeSender: CodeSender = {
    ...codeSender,
    send: () => {
      proofState.setCode('');
      codeSender.send();
    },
  };

  const verifyLabel = newEmailSender.isSending
    ? t('changeEmailDialog.sending')
    : newEmailSender.resendSecondsLeft > 0
      ? t('changeEmailDialog.resendIn', { time: formatCountdown(newEmailSender.resendSecondsLeft) })
      : isCodeStepOpen
        ? t('changeEmailDialog.resend')
        : t('changeEmailDialog.verify');

  const showGeneralError =
    errorMessage !== null && !isProofFieldError(proofErrorCode) && !isAddressError(errorCode) && subject !== 'NEW_EMAIL';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t(hasEmail ? 'changeEmailDialog.title' : 'changeEmailDialog.titleAdd')}</DialogTitle>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!isComplete) return;
            onSubmit({ newEmail: newEmail.trim(), newEmailCode: digitsOf(newCode), proof: proofState.proof() });
          }}
        >
          <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('changeEmailDialog.body')}</p>

          <h5 className="mb-2 text-2sm font-semibold text-text-secondary">{t('changeEmailDialog.confirmHeading')}</h5>
          <ConfirmationProofFields
            idPrefix="change-email"
            method={proofState.method}
            onMethodChange={proofState.setMethod}
            password={proofState.password}
            onPasswordChange={proofState.setPassword}
            code={proofState.code}
            onCodeChange={proofState.setCode}
            passwordLabel={t('changeEmailDialog.passwordLabel')}
            passwordToggle={{ show: t('changeEmailDialog.showPassword'), hide: t('changeEmailDialog.hidePassword') }}
            hasEmail={hasEmail}
            codeSender={proofCodeSender}
            passwordLockSeconds={proofState.lockSeconds}
            errorCode={proofErrorCode}
            errorMessage={errorMessage}
            i18nOverridePrefix={i18nOverridePrefix}
          />

          <h5 className="mb-2 text-2sm font-semibold text-text-secondary">{t('changeEmailDialog.newHeading')}</h5>
          <div className="mb-3">
            <Label htmlFor="change-email-address">{t('changeEmailDialog.newLabel')}</Label>
            <Input
              id="change-email-address"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={newEmail}
              onChange={(event) => changeAddress(event.target.value)}
              aria-invalid={addressError !== null}
              aria-describedby={addressError !== null ? 'change-email-address-error' : undefined}
            />
            {addressError !== null && (
              <p id="change-email-address-error" role="alert" className="mt-1 text-2xs text-text-danger">
                {addressError}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={verify} disabled={!canVerify}>
                {verifyLabel}
              </Button>
            </div>
          </div>

          {isCodeStepOpen && (
            <div className="mb-3">
              <p className="mb-2 text-2xs text-text-secondary">
                {t('changeEmailDialog.codeSent', {
                  email: newEmail.trim(),
                  minutes: Math.round(newEmailSender.expiresInSeconds / 60),
                })}
              </p>
              <Label htmlFor="change-email-new-code">{t('changeEmailDialog.codeLabel')}</Label>
              <Input
                id="change-email-new-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                aria-invalid={newCodeError !== null}
                aria-describedby={newCodeError !== null ? 'change-email-new-code-error' : undefined}
              />
              {newCodeError !== null && (
                <p id="change-email-new-code-error" role="alert" className="mt-1 text-2xs text-text-danger">
                  {newCodeError}
                </p>
              )}
            </div>
          )}

          <p className="mb-2 text-2xs text-text-muted">{t('changeEmailDialog.warning')}</p>
          {showGeneralError && (
            <p role="alert" className="mt-2 text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!isComplete || isSubmitting}>
              {isSubmitting
                ? t('changeEmailDialog.submitting')
                : t(hasEmail ? 'changeEmailDialog.submit' : 'changeEmailDialog.submitAdd')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t('changeEmailDialog.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
