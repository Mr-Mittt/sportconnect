/**
 * AUTH-14: where the browser goes to sign in. Keycloak (hosted pages, Authorization Code + PKCE)
 * owns the credentials; this app only builds the redirect and, on return, hands the code to the
 * backend (`POST /api/auth/callback`). The realm and client id mirror
 * `infra/keycloak/realm/sportconnect-realm.json`.
 */
export const KEYCLOAK_REALM = 'sportconnect';
export const KEYCLOAK_CLIENT_ID = 'sportconnect-web';

/** Dev default is the Compose service; set `VITE_KEYCLOAK_URL` for any other environment. */
export function keycloakBaseUrl(): string {
  const configured = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;
  return (configured && configured.length > 0 ? configured : 'http://localhost:8081').replace(/\/$/, '');
}

export const AUTH_CALLBACK_PATH = '/auth/callback';
