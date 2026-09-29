import { IconBrandApple, IconBrandFacebook, IconBrandGoogle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { LoginPayload } from '../types';

interface LoginFormProps {
  onSubmit: (payload: LoginPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Presentational and controlled — LoginPage owns the mutation, this owns
 * only the form's own field values and the password-visibility toggle
 * (ephemeral UI state, not shared with anything else). Email/password
 * validity relies on native HTML5 constraint validation (required,
 * type="email") rather than a hand-rolled validator — the server response
 * is the actual source of truth for whether credentials are correct.
 *
 * CLIENT-I18N-2 (step 1 of that ticket's "translate the rest of the app"): translated via a new
 * `login` namespace (own namespace, not shared with `register` — their strings don't overlap
 * beyond structure, same "one namespace per page" convention `app/i18n.ts` documents). The server's
 * own `errorMessage` (from `useLogin`) stays untranslated — same accepted exception `RegisterForm`
 * already established (arbitrary backend free text, nothing to translate it into).
 */
export function LoginForm({ onSubmit, isPending, errorMessage }: LoginFormProps) {
  const { t } = useTranslation('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ email, password });
  }

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
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
        <Label htmlFor="login-email">{t('form.email.label')}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <Label htmlFor="login-password">{t('form.password.label')}</Label>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
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
