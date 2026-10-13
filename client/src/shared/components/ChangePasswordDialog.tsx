import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type ComponentProps } from 'react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

// Mirrors ChangePasswordRequest's @Size(min = 8) (same minimum RegisterForm / ResetPasswordForm enforce).
const MIN_PASSWORD_LENGTH = 8;

interface PasswordInputProps
  extends Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'autoComplete' | 'className'> {
  value: string;
  onChange: (value: string) => void;
  showLabel: string;
  hideLabel: string;
}

/** A password field with its own show/hide toggle; every instance reveals independently of the others. */
function PasswordInput({ value, onChange, showLabel, hideLabel, ...inputProps }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...inputProps}
        type={isVisible ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-label={isVisible ? hideLabel : showLabel}
        onClick={() => setIsVisible((prev) => !prev)}
        className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted"
      >
        {isVisible ? (
          <IconEyeOff className="size-4" aria-hidden="true" />
        ) : (
          <IconEye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives both passwords once client validation passes; the parent fires `PUT /users/me/password`. */
  onSubmit: (payload: { currentPassword: string; newPassword: string }) => void;
  isSubmitting: boolean;
  /** Localized line for a failed change; the dialog stays open. */
  errorMessage: string | null;
  /** When true, `errorMessage` is shown on the current-password field instead of as a general line. */
  isCurrentPasswordError?: boolean;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-3: changes the caller's own password. Current password (verified server-side), new
 * password and a confirm field that is checked on the client only. Validation is custom
 * (`noValidate`, I18N-10) and shown after the first submit attempt. `AppShell` mounts this only
 * while open, so typed passwords are dropped on every close. The current-password field starts
 * empty and read-only until focused, for the same autofill reason as `DeactivateAccountDialog`.
 */
export function ChangePasswordDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
  isCurrentPasswordError = false,
  i18nOverridePrefix,
}: ChangePasswordDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isFieldUnlocked, setIsFieldUnlocked] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isTooShort = newPassword.length < MIN_PASSWORD_LENGTH;
  const isMismatch = newPassword !== confirm;
  const isValid = currentPassword !== '' && !isTooShort && !isMismatch;

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
            onSubmit({ currentPassword, newPassword });
          }}
        >
          <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('changePasswordDialog.body')}</p>

          <div className="mb-3">
            <Label htmlFor="change-password-current">{t('changePasswordDialog.currentLabel')}</Label>
            <PasswordInput
              id="change-password-current"
              value={currentPassword}
              onChange={setCurrentPassword}
              showLabel={t('changePasswordDialog.showCurrent')}
              hideLabel={t('changePasswordDialog.hideCurrent')}
              readOnly={!isFieldUnlocked}
              onFocus={() => setIsFieldUnlocked(true)}
              aria-invalid={isCurrentPasswordError}
              aria-describedby={isCurrentPasswordError ? 'change-password-current-error' : undefined}
            />
            {isCurrentPasswordError && errorMessage !== null && (
              <p id="change-password-current-error" role="alert" className="mt-1 text-2xs text-text-danger">
                {errorMessage}
              </p>
            )}
          </div>

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
            />
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

          {!isCurrentPasswordError && errorMessage !== null && (
            <p role="alert" className="mt-2 text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={currentPassword === '' || isSubmitting}>
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
