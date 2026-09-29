import { IconBrandApple, IconBrandFacebook, IconBrandGoogle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { LoginPayload } from '../types';

// Same simple shape RegisterForm's own EMAIL_PATTERN uses (mirrors @Email server-side) — not a
// full RFC 5322 parser, just enough to catch an obviously incomplete address before it
// round-trips to the server.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFormProps {
  onSubmit: (payload: LoginPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Presentational and controlled — LoginPage owns the mutation, this owns
 * only the form's own field values and the password-visibility toggle
 * (ephemeral UI state, not shared with anything else). Password *content*
 * is never validated client-side beyond "non-empty" — the server response
 * is the actual source of truth for whether credentials are correct, and
 * login (unlike registration) has no minimum-length rule of its own.
 *
 * CLIENT-I18N-2 (step 1 of that ticket's "translate the rest of the app"): translated via a new
 * `login` namespace (own namespace, not shared with `register` — their strings don't overlap
 * beyond structure, same "one namespace per page" convention `app/i18n.ts` documents). The server's
 * own `errorMessage` (from `useLogin`) stays untranslated — same accepted exception `RegisterForm`
 * already established (arbitrary backend free text, nothing to translate it into; I18N-4).
 *
 * **Validation is entirely custom (`noValidate` on the `<form>`), not native HTML constraint
 * validation** (2026-09-29 fix, found in review of this same ticket's translation pass —
 * documented as `I18N_READINESS.md`'s I18N-10 so it isn't missed a third time): a browser's own
 * "Please fill out this field" popup renders in the *browser's* language, never this app's
 * `i18next` locale, so switching to Vietnamese never translated it — the exact bug `RegisterForm`
 * already fixed, just not carried over here when this form was first translated. Same
 * `hasAttemptedSubmit` pattern: the submit button is always clickable; clicking it while invalid
 * sets `hasAttemptedSubmit` and reveals translated inline error text beside the invalid field's own
 * label instead of submitting. No `RequiredMark` here (unlike `RegisterForm`) — every field on this
 * form is required, so a visual "*" on both adds no information a `RegisterForm`-style optional/
 * required distinction would; `aria-required="true"` still carries the a11y signal.
 */
export function LoginForm({ onSubmit, isPending, errorMessage }: LoginFormProps) {
  const { t } = useTranslation('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const isEmailEmpty = email.trim() === '';
  const isEmailInvalid = !isEmailEmpty && !EMAIL_PATTERN.test(email.trim());
  const isPasswordEmpty = password === '';
  const isValid = !isEmailEmpty && !isEmailInvalid && !isPasswordEmpty;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit({ email, password });
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
          <Label htmlFor="login-email" className="mb-0">
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
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-required="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <Label htmlFor="login-password" className="mb-0">
            {t('form.password.label')}
          </Label>
          {hasAttemptedSubmit && isPasswordEmpty && (
            <span className="text-2xs text-text-danger">{t('form.password.error.required')}</span>
          )}
        </div>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
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

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? t('form.submitting') : t('form.submit')}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <div className="border-hairline-t flex-1 border-border" />
        <span className="text-xs text-text-muted">{t('form.or')}</span>
        <div className="border-hairline-t flex-1 border-border" />
      </div>

      <div className="flex flex-col gap-2.5">
        {/* OAuth is deferred to its own ticket (client/docs/BACKLOG_MVP.md) — visually
            present per the mockup, but non-functional until then. */}
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandFacebook className="size-4" aria-hidden="true" />
          {t('form.oauth.facebook')}
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandGoogle className="size-4" aria-hidden="true" />
          {t('form.oauth.google')}
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandApple className="size-4" aria-hidden="true" />
          {t('form.oauth.apple')}
        </Button>
      </div>

      <p className="mt-6 text-center text-2sm text-text-secondary">
        {t('form.newToSportHub')}{' '}
        <Link to="/register" className="text-text-accent hover:underline">
          {t('form.createAccount')}
        </Link>
      </p>
    </form>
  );
}
