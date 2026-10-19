import { useState } from 'react';
import { isCodeProofError, type ConfirmationMethod } from '@/features/profile/confirmationProof';
import type { CodeSender } from '@/features/profile/useConfirmationCode';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { formatCountdown } from '@/shared/lib/useCountdown';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup } from '@/shared/ui/radio-group';
import { PasswordInput } from './PasswordInput';

interface ConfirmationProofFieldsProps {
  /** Prefix for the element ids, unique per dialog. */
  idPrefix: string;
  method: ConfirmationMethod;
  onMethodChange: (method: ConfirmationMethod) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  /** The password field's label ("Current password", "Confirm with your password"). */
  passwordLabel: string;
  /** Show/hide labels, for a dialog whose password field has the toggle. */
  passwordToggle?: { show: string; hide: string };
  /** False for a phone-only account: the email method is disabled and says why. */
  hasEmail: boolean;
  codeSender: CodeSender;
  /** Seconds left of a `PASSWORD_ATTEMPTS_EXCEEDED` lock; `0` when the password may be tried. */
  passwordLockSeconds: number;
  /** The failed confirmation's server code and localized line (this component places the ones about its fields). */
  errorCode: string | null;
  errorMessage: string | null;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-6: the confirmation step shared by the deactivate and change-password dialogs: a radio
 * choice between the current password and a code emailed to the account (backend U24), then that
 * method's fields. The email method is a Send code button with a visible resend countdown and a
 * 6-digit code input (`one-time-code`, spaces accepted). A wrong password offers a one-click switch
 * to the code (a Google-only account has no password); a password lock disables the password method
 * and shows the time left. Controlled: the dialog owns the values and the request state.
 */
export function ConfirmationProofFields({
  idPrefix,
  method,
  onMethodChange,
  password,
  onPasswordChange,
  code,
  onCodeChange,
  passwordLabel,
  passwordToggle,
  hasEmail,
  codeSender,
  passwordLockSeconds,
  errorCode,
  errorMessage,
  i18nOverridePrefix,
}: ConfirmationProofFieldsProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(false);
  const isLocked = passwordLockSeconds > 0;
  const canResend = !codeSender.isSending && codeSender.resendSecondsLeft === 0;
  const codeError = isCodeProofError(errorCode) ? errorMessage : null;
  const passwordError = errorCode === 'CURRENT_PASSWORD_INCORRECT' ? errorMessage : null;

  return (
    <div className="mb-3">
      <RadioGroup
        name={`${idPrefix}-method`}
        aria-label={t('confirm.methodLabel')}
        value={method}
        onValueChange={(value) => onMethodChange(value === 'email' ? 'email' : 'password')}
        options={[
          { value: 'password', label: t('confirm.method.password'), disabled: isLocked && hasEmail },
          { value: 'email', label: t('confirm.method.email'), disabled: !hasEmail },
        ]}
        className="mb-3"
      />
      {!hasEmail && <p className="mb-3 text-2xs text-text-muted">{t('confirm.noEmail')}</p>}

      {isLocked && (
        <p role="alert" className="mb-3 text-2xs text-text-danger">
          {t(hasEmail ? 'confirm.passwordLocked' : 'confirm.passwordLockedNoEmail', {
            time: formatCountdown(passwordLockSeconds),
          })}
        </p>
      )}

      {method === 'password' && (
        <div>
          <Label htmlFor={`${idPrefix}-password`}>{passwordLabel}</Label>
          <PasswordInput
            id={`${idPrefix}-password`}
            value={password}
            onChange={onPasswordChange}
            showLabel={passwordToggle?.show}
            hideLabel={passwordToggle?.hide}
            readOnly={!isPasswordUnlocked}
            onFocus={() => setIsPasswordUnlocked(true)}
            disabled={isLocked}
            aria-invalid={passwordError !== null}
            aria-describedby={passwordError !== null ? `${idPrefix}-password-error` : undefined}
          />
          {passwordError !== null && (
            <div className="mt-1">
              <p id={`${idPrefix}-password-error`} role="alert" className="text-2xs text-text-danger">
                {passwordError}
              </p>
              {hasEmail && (
                <p className="mt-1 text-2xs text-text-secondary">
                  {t('confirm.passwordHint')}{' '}
                  <button
                    type="button"
                    onClick={() => onMethodChange('email')}
                    className="cursor-pointer text-text-accent underline"
                  >
                    {t('confirm.useCodeInstead')}
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {method === 'email' && (
        <div>
          {!codeSender.hasSent ? (
            <Button type="button" variant="outline" size="sm" onClick={codeSender.send} disabled={codeSender.isSending}>
              {codeSender.isSending ? t('confirm.sending') : t('confirm.sendCode')}
            </Button>
          ) : (
            <>
              <p className="mb-2 text-2xs text-text-secondary">
                {t('confirm.codeSent', { minutes: Math.round(codeSender.expiresInSeconds / 60) })}
              </p>
              <Label htmlFor={`${idPrefix}-code`}>{t('confirm.codeLabel')}</Label>
              <div className="flex items-start gap-2">
                <Input
                  id={`${idPrefix}-code`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => onCodeChange(event.target.value)}
                  aria-invalid={codeError !== null}
                  aria-describedby={codeError !== null ? `${idPrefix}-code-error` : undefined}
                />
                <Button type="button" variant="outline" size="sm" onClick={codeSender.send} disabled={!canResend}>
                  {codeSender.isSending
                    ? t('confirm.sending')
                    : canResend
                      ? t('confirm.resend')
                      : t('confirm.resendIn', { time: formatCountdown(codeSender.resendSecondsLeft) })}
                </Button>
              </div>
              {codeError !== null && (
                <p id={`${idPrefix}-code-error`} role="alert" className="mt-1 text-2xs text-text-danger">
                  {codeError}
                </p>
              )}
            </>
          )}
          {codeSender.errorMessage !== null && (
            <p role="alert" className="mt-2 text-2xs text-text-danger">
              {codeSender.errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
