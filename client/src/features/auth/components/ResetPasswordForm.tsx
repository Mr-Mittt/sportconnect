import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

// Same minimum RegisterForm enforces (mirrors ResetPasswordRequest's @Size(min = 8)).
const MIN_PASSWORD_LENGTH = 8;

interface ResetPasswordFormProps {
  onSubmit: (newPassword: string) => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Presentational and controlled — ResetPasswordPage owns the token and the mutation. The confirm
 * field is checked on the client only (the server never sees it). Custom validation, same I18N-10
 * pattern as LoginForm. Dead-link errors (`RESET_TOKEN_*`) are not shown here: the page swaps this
 * form for `ResetLinkProblem`, so `errorMessage` only carries validation/transport failures.
 */
export function ResetPasswordForm({ onSubmit, isPending, errorMessage }: ResetPasswordFormProps) {
  const { t } = useTranslation('resetPassword');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isTooShort = password.length < MIN_PASSWORD_LENGTH;
  const isMismatch = password !== confirm;
  const isValid = !isTooShort && !isMismatch;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit(password);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">{t('heading')}</h1>
      <p className="mb-6 text-2sm text-text-secondary">{t('subheading')}</p>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2sm text-text-danger"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="reset-password" className="mb-0">
            {t('form.password.label')}
          </Label>
          {hasAttemptedSubmit && isTooShort && (
            <span className="text-2xs text-text-danger">{t('form.password.error.tooShort')}</span>
          )}
        </div>
        <div className="relative">
          <Input
            id="reset-password"
            name="newPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-required="true"
            className="pr-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={showPassword ? t('form.password.hideAction') : t('form.password.showAction')}
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted"
          >
            {showPassword ? (
              <IconEyeOff className="size-4" aria-hidden="true" />
            ) : (
              <IconEye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="reset-password-confirm" className="mb-0">
            {t('form.confirm.label')}
          </Label>
          {hasAttemptedSubmit && !isTooShort && isMismatch && (
            <span className="text-2xs text-text-danger">{t('form.confirm.error.mismatch')}</span>
          )}
        </div>
        <Input
          id="reset-password-confirm"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          aria-required="true"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? t('form.submitting') : t('form.submit')}
      </Button>
    </form>
  );
}
