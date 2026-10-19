import { useState } from 'react';
import {
  CODE_LENGTH,
  digitsOf,
  isDeadCodeError,
  type ConfirmationMethod,
  type ConfirmationProof,
} from '@/features/profile/confirmationProof';

/**
 * ACCOUNT-6: the form state both confirmation dialogs share: the chosen method and its two inputs,
 * the password-lock countdown, and the proof to send. Two rules live here so the dialogs agree:
 * a password lock moves the user to the emailed code (when the account has an email), and a dead
 * code (`VERIFICATION_CODE_EXPIRED` / `_ATTEMPTS_EXCEEDED`) empties the code input so a new one is typed.
 */
export function useConfirmationProofState(input: {
  hasEmail: boolean;
  errorCode: string | null;
  /** Seconds left of a `PASSWORD_ATTEMPTS_EXCEEDED` lock; `0` when the password may be tried. */
  passwordLockSeconds: number;
}) {
  const [method, setMethod] = useState<ConfirmationMethod>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [seenErrorCode, setSeenErrorCode] = useState<string | null>(input.errorCode);
  const lockSeconds = input.passwordLockSeconds;

  // Adjusting state while rendering (not in an effect) so there is no frame with the stale value.
  if (input.errorCode !== seenErrorCode) {
    setSeenErrorCode(input.errorCode);
    if (isDeadCodeError(input.errorCode)) setCode('');
  }
  if (lockSeconds > 0 && method === 'password' && input.hasEmail) {
    setMethod('email');
  }

  const isComplete =
    method === 'password' ? password !== '' && lockSeconds === 0 : digitsOf(code).length === CODE_LENGTH;
  const proof = (): ConfirmationProof =>
    method === 'password'
      ? { method: 'password', currentPassword: password }
      : { method: 'email', verificationCode: digitsOf(code) };

  return { method, setMethod, password, setPassword, code, setCode, lockSeconds, isComplete, proof };
}
