/**
 * AUTH-14: the PKCE pair and the one-shot hand-over across the Keycloak redirect.
 *
 * The verifier, `state` and `returnTo` live in `localStorage`, one entry per login attempt keyed by its
 * `state`, only for the length of the redirect: they expire after `PKCE_TTL_MS` and are removed the moment
 * `/auth/callback` reads them (`takePkceState`). They are not a token — the "no token in storage" rule
 * (client/CLAUDE.md § Auth) still holds, and the verifier alone is useless without the one-time code.
 *
 * Why not `sessionStorage` (A29): an emailed Keycloak link (linking a Google sign-in to an existing account,
 * later email verification) opens a NEW tab, and Keycloak finishes the login there. A per-tab store is empty in
 * that tab, so the callback could not find its verifier and refused a perfectly good code. `state` is a 128-bit
 * random value, so only the tab holding the redirect URL can name the entry, and it is read once.
 */
const KEY_PREFIX = 'sportconnect.pkce.';

/**
 * How long an entry may wait for its callback. It must outlast the emailed link (30 minutes, realm attribute
 * `actionTokenGeneratedByUserLifespan.idp-verify-account-via-email`) and Keycloak's own login timeout (30
 * minutes by default): a link opened in the last minute still has to find its verifier. Past that Keycloak
 * refuses the flow itself, so an older entry is dead weight and is swept.
 */
export const PKCE_TTL_MS = 35 * 60 * 1000;

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

/** Drops every entry past its expiry (an abandoned login would otherwise stay in the browser for good). */
function sweepExpired(now: number): void {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '') as { expiresAt?: unknown };
      if (typeof parsed.expiresAt === 'number' && parsed.expiresAt > now) continue;
    } catch {
      // unreadable: drop it
    }
    localStorage.removeItem(key);
  }
}

export function savePkceState(value: PkceState): void {
  try {
    const now = Date.now();
    sweepExpired(now);
    localStorage.setItem(KEY_PREFIX + value.state, JSON.stringify({ ...value, expiresAt: now + PKCE_TTL_MS }));
  } catch {
    // Storage blocked: the callback finds nothing and shows its "try again" view.
  }
}

/**
 * Reads and removes the entry the callback's `state` names, so a code can be exchanged once and only by a tab
 * that holds that state. Null when there is none, it expired, or it is malformed.
 */
export function takePkceState(state: string | null): PkceState | null {
  if (!state) return null;
  try {
    const key = KEY_PREFIX + state;
    const raw = localStorage.getItem(key);
    localStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PkceState> & { expiresAt?: unknown };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null;
    if (typeof parsed.codeVerifier !== 'string' || parsed.state !== state) return null;
    return {
      codeVerifier: parsed.codeVerifier,
      state: parsed.state,
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}
