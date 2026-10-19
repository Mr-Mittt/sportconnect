/** ACCOUNT-6: the two ways to confirm deactivating or changing a password (backend U24: send exactly one). */
export type ConfirmationMethod = 'password' | 'email';

export type ConfirmationProof =
  | { method: 'password'; currentPassword: string }
  | { method: 'email'; verificationCode: string };

/** What the backend takes: only the chosen proof, so it never meets "both" (`CONFIRMATION_REQUIRED`). */
export function proofBody(proof: ConfirmationProof): { currentPassword: string } | { verificationCode: string } {
  return proof.method === 'password'
    ? { currentPassword: proof.currentPassword }
    : { verificationCode: proof.verificationCode };
}

/** The 6 digits of what the user pasted ("123 456", "123-456" and trailing spaces all work). */
export function digitsOf(code: string): string {
  return code.replace(/\D/g, '');
}

export const CODE_LENGTH = 6;

/** Server codes about the password proof: `ConfirmationProofFields` shows them on that method. */
export function isPasswordProofError(code: string | null): boolean {
  return code === 'CURRENT_PASSWORD_INCORRECT' || code === 'PASSWORD_ATTEMPTS_EXCEEDED';
}

/** Server codes about the emailed code: shown on the code input. */
export function isCodeProofError(code: string | null): boolean {
  return code !== null && code.startsWith('VERIFICATION_CODE_');
}

/** Codes after which the typed code is useless: the input is cleared and a new one must be asked for. */
export function isDeadCodeError(code: string | null): boolean {
  return code === 'VERIFICATION_CODE_EXPIRED' || code === 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED';
}

/** True when `ConfirmationProofFields` shows this failure on its own fields, so the dialog skips its general line. */
export function isProofFieldError(code: string | null): boolean {
  return isPasswordProofError(code) || isCodeProofError(code);
}
