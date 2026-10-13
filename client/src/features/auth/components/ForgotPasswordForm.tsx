import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { ForgotPasswordPayload } from '../types';

// Same shape LoginForm/RegisterForm use (mirrors @Email server-side).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ForgotPasswordFormProps {
  onSubmit: (payload: ForgotPasswordPayload) => void;
  isPending: boolean;
  /** True once the server accepted the request — swaps the form for the neutral confirmation. */
  isSent: boolean;
  errorMessage: string | null;
  /** Prefilled from the login form's email field, when the user came from there. */
  initialEmail?: string;
}

/**
 * Presentational and controlled — ForgotPasswordPage owns the mutation. Validation is custom
 * (`noValidate`, `hasAttemptedSubmit`) for the same I18N-10 reason as LoginForm: native browser
 * popups are never translated. The sent state is deliberately identical whether or not the email
 * has an account (the server answers the same), so it never confirms the address exists.
 * No resend control: A5 (rate limiting) is not built, so a one-click resend would invite abuse.
 */
export function ForgotPasswordForm({
  onSubmit,
  isPending,
  isSent,
  errorMessage,
  initialEmail = '',
}: ForgotPasswordFormProps) {
  const { t } = useTranslation('forgotPassword');
  const [email, setEmail] = useState(initialEmail);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isEmailEmpty = email.trim() === '';
  const isEmailInvalid = !isEmailEmpty && !EMAIL_PATTERN.test(email.trim());
  const isValid = !isEmailEmpty && !isEmailInvalid;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit({ email: email.trim() });
  }

  if (isSent) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">{t('sent.heading')}</h1>
        <p role="status" className="mb-6 text-2sm text-text-secondary">
          {t('sent.body')}
        </p>
        <Link to="/login" className="text-2sm text-text-accent hover:underline">
          {t('form.backToLogin')}
        </Link>
      </div>
    );
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

      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="forgot-email" className="mb-0">
            {t('form.email.label')}
          </Label>
          {hasAttemptedSubmit && isEmailEmpty && (
            <span className="text-2xs text-text-danger">{t('form.email.error.required')}</span>
          )}
          {hasAttemptedSubmit && isEmailInvalid && (
            <span className="text-2xs text-text-danger">{t('form.email.error.invalid')}</span>
          )}
        </div>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? t('form.submitting') : t('form.submit')}
      </Button>

      <p className="mt-6 text-center text-2sm">
        <Link to="/login" className="text-text-accent hover:underline">
          {t('form.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
