import { IconBrandApple, IconBrandFacebook, IconBrandGoogle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { RegisterPayload } from '../types';

interface RegisterFormProps {
  onSubmit: (payload: RegisterPayload) => void;
  isPending: boolean;
  errorMessage: string | null;
}

/**
 * Presentational and controlled — RegisterPage owns the mutation, this owns
 * only the form's own field values and the password-visibility toggle
 * (ephemeral UI state). Client-side length constraints mirror
 * RegisterRequest's server-side validation (password min 8, full name max
 * 200, phone number max 20) via native HTML validation; the server response
 * is the source of truth for anything it can't check client-side (e.g. email
 * already taken).
 */
export function RegisterForm({ onSubmit, isPending, errorMessage }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      email,
      password,
      fullName,
      ...(phoneNumber ? { phoneNumber } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">Create your account</h1>
      <p className="mb-6 text-2sm text-text-secondary">Join SportHub and find your next game.</p>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border-hairline border-border bg-bg-accent px-3 py-2 text-2sm text-text-danger"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="register-password">Password</Label>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
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

      <div className="mb-4">
        <Label htmlFor="register-full-name">Full name</Label>
        <Input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          maxLength={200}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <Label htmlFor="register-phone-number">Phone number (optional)</Label>
        <Input
          id="register-phone-number"
          name="phoneNumber"
          type="tel"
          autoComplete="tel"
          maxLength={20}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
      </div>

      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <div className="border-hairline-t flex-1 border-border" />
        <span className="text-xs text-text-muted">or</span>
        <div className="border-hairline-t flex-1 border-border" />
      </div>

      <div className="flex flex-col gap-2.5">
        {/* OAuth is deferred to its own ticket (client/docs/BACKLOG_MVP.md) — visually
            present for parity with Login, but non-functional until then. */}
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
        Already have an account?{' '}
        <Link to="/login" className="text-text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
