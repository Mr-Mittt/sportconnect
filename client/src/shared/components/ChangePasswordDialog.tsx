import { useState } from 'react';
import { isProofFieldError, type ConfirmationProof } from '@/features/profile/confirmationProof';
import type { CodeSender } from '@/features/profile/useConfirmationCode';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { ConfirmationProofFields } from './ConfirmationProofFields';
import { PasswordInput } from './PasswordInput';
import { useConfirmationProofState } from './useConfirmationProofState';

// Mirrors ChangePasswordRequest's @Size(min = 8) (same minimum the Keycloak realm policy enforces).
const MIN_PASSWORD_LENGTH = 8;

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the one proof the user chose and the new password once client validation passes; the parent fires `PUT /users/me/password`. */
  onSubmit: (payload: { proof: ConfirmationProof; newPassword: string }) => void;
  isSubmitting: boolean;
  /** Localized line for a failed change; the dialog stays open. */
  errorMessage: string | null;
  /** The failed request's server code, used to place `errorMessage` (password, code, new password, or general). */
  errorCode?: string | null;
  /** False for an account with no email (phone-only): the emailed-code method is disabled. */
  hasEmail?: boolean;
  /** The "verify by email" method (from `useConfirmationCode('CHANGE_PASSWORD')`). */
  codeSender: CodeSender;
  /** Seconds left of a `PASSWORD_ATTEMPTS_EXCEEDED` lock (counted down by the hook); `0` when none. */
  passwordLockSeconds?: number;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-3, ACCOUNT-6: changes the caller's own password. The caller proves who they are with the
 * current password (verified by Keycloak) or a code emailed to the account, chosen by a radio
 * (`ConfirmationProofFields`), then gives a new password and a confirm field that is checked on the
 * client only. Validation is custom (`noValidate`, I18N-10) and shown after the first submit
 * attempt. `AppShell` mounts this only while open, so typed passwords and codes are dropped on every
 * close.
 */
export function ChangePasswordDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
  errorCode = null,
  hasEmail = true,
  codeSender,
  passwordLockSeconds = 0,
  i18nOverridePrefix,
}: ChangePasswordDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const state = useConfirmationProofState({ hasEmail, errorCode, passwordLockSeconds });
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isTooShort = newPassword.length < MIN_PASSWORD_LENGTH;
  const isMismatch = newPassword !== confirm;
  const isValid = state.isComplete && !isTooShort && !isMismatch;
  const isNewPasswordError = errorCode === 'NEW_PASSWORD_REJECTED';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t('changePasswordDialog.title')}</DialogTitle>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!isValid) {
              setHasAttemptedSubmit(true);
              return;
            }
            onSubmit({ proof: state.proof(), newPassword });
          }}
        >
          <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('changePasswordDialog.body')}</p>

          <ConfirmationProofFields
            idPrefix="change-password"
            method={state.method}
            onMethodChange={state.setMethod}
            password={state.password}
            onPasswordChange={state.setPassword}
            code={state.code}
            onCodeChange={state.setCode}
            passwordLabel={t('changePasswordDialog.currentLabel')}
            passwordToggle={{ show: t('changePasswordDialog.showCurrent'), hide: t('changePasswordDialog.hideCurrent') }}
            hasEmail={hasEmail}
            codeSender={codeSender}
            passwordLockSeconds={state.lockSeconds}
            errorCode={errorCode}
            errorMessage={errorMessage}
            i18nOverridePrefix={i18nOverridePrefix}
          />

          <div className="mb-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <Label htmlFor="change-password-new" className="mb-0">
                {t('changePasswordDialog.newLabel')}
              </Label>
              {hasAttemptedSubmit && isTooShort && (
                <span className="text-2xs text-text-danger">{t('changePasswordDialog.error.tooShort')}</span>
              )}
            </div>
            <PasswordInput
              id="change-password-new"
              value={newPassword}
              onChange={setNewPassword}
              showLabel={t('changePasswordDialog.showNew')}
              hideLabel={t('changePasswordDialog.hideNew')}
              aria-invalid={isNewPasswordError}
              aria-describedby={isNewPasswordError ? 'change-password-new-error' : undefined}
            />
            {isNewPasswordError && errorMessage !== null && (
              <p id="change-password-new-error" role="alert" className="mt-1 text-2xs text-text-danger">
                {errorMessage}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <Label htmlFor="change-password-confirm" className="mb-0">
                {t('changePasswordDialog.confirmLabel')}
              </Label>
              {hasAttemptedSubmit && !isTooShort && isMismatch && (
                <span className="text-2xs text-text-danger">{t('changePasswordDialog.error.mismatch')}</span>
              )}
            </div>
            <PasswordInput
              id="change-password-confirm"
              value={confirm}
              onChange={setConfirm}
              showLabel={t('changePasswordDialog.showConfirm')}
              hideLabel={t('changePasswordDialog.hideConfirm')}
            />
          </div>

          {errorMessage !== null && !isProofFieldError(errorCode) && !isNewPasswordError && (
            <p role="alert" className="mt-2 text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!state.isComplete || isSubmitting}>
              {isSubmitting ? t('changePasswordDialog.submitting') : t('changePasswordDialog.submit')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t('changePasswordDialog.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
