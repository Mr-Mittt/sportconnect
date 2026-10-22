/**
 * AUTH-14: the PKCE pair and the one-shot hand-over across the Keycloak redirect.
 *
 * The verifier, `state` and `returnTo` live in `sessionStorage` only for the length of the redirect
 * and are removed the moment `/auth/callback` reads them (`takePkceState`). They are not a token —
 * the "no token in storage" rule (client/CLAUDE.md § Auth) still holds.
 */
const STORAGE_KEY = 'sportconnect.pkce';

export interface PkceState {
  codeVerifier: string;
  state: string;
  returnTo: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** 48 random bytes encode to 64 characters, inside the backend's 43 to 128 verifier window. */
export function createCodeVerifier(): string {
  return randomToken(48);
}

export function createState(): string {
  return randomToken(16);
}

/** S256: `base64url(sha256(verifier))`. */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Only an in-app absolute path may be returned to; anything else (a URL, `//host`) becomes `/`. */
export function safeReturnTo(value: string | undefined | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function savePkceState(value: PkceState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the callback finds nothing and shows its "try again" view.
  }
}

/** Reads and removes the stored entry, so a code can only be exchanged by the tab that asked for it, once. */
export function takePkceState(): PkceState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PkceState>;
    if (typeof parsed.codeVerifier !== 'string' || typeof parsed.state !== 'string') return null;
    return {
      codeVerifier: parsed.codeVerifier,
      state: parsed.state,
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}
