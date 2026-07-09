import { IconBrandApple, IconBrandFacebook, IconBrandGoogle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
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
 */
export function LoginForm({ onSubmit, isPending, errorMessage }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ email, password });
  }

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">Welcome back</h1>
      <p className="mb-6 text-2sm text-text-secondary">Log in to pick up where you left off.</p>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2sm text-text-danger"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="login-email">Email</Label>
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
        <Label htmlFor="login-password">Password</Label>
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
        {isPending ? 'Logging in…' : 'Log in'}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <div className="border-hairline-t flex-1 border-border" />
        <span className="text-xs text-text-muted">or</span>
        <div className="border-hairline-t flex-1 border-border" />
      </div>

      <div className="flex flex-col gap-2.5">
        {/* OAuth is deferred to its own ticket (client/docs/BACKLOG_MVP.md) — visually
            present per the mockup, but non-functional until then. */}
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandFacebook className="size-4" aria-hidden="true" />
          Continue with Facebook
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandGoogle className="size-4" aria-hidden="true" />
          Continue with Google
        </Button>
        <Button variant="outline" className="w-full" disabled aria-disabled="true">
          <IconBrandApple className="size-4" aria-hidden="true" />
          Continue with Apple
        </Button>
      </div>

      <p className="mt-6 text-center text-2sm text-text-secondary">
        New to SportHub?{' '}
        <Link to="/register" className="text-text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
