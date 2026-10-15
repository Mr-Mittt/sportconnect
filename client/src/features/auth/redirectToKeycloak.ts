import i18next from 'i18next';
import {
  AUTH_CALLBACK_PATH,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_REALM,
  keycloakBaseUrl,
} from './keycloak';
import { codeChallengeFor, createCodeVerifier, createState, safeReturnTo, savePkceState } from './pkce';

export type KeycloakEntry = 'login' | 'register';

/** Builds the Keycloak authorization URL for a fresh PKCE pair and stores the pair for the callback. */
export async function buildKeycloakAuthUrl(mode: KeycloakEntry, returnTo?: string): Promise<string> {
  const codeVerifier = createCodeVerifier();
  const state = createState();
  savePkceState({ codeVerifier, state, returnTo: safeReturnTo(returnTo) });

  const params = new URLSearchParams({
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: await codeChallengeFor(codeVerifier),
    code_challenge_method: 'S256',
    // A24: a bare kc_locale is ignored on the first request; ui_locales is the standard hint.
    ui_locales: i18next.language,
  });
  if (mode === 'register') params.set('prompt', 'create');

  return `${keycloakBaseUrl()}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth?${params.toString()}`;
}

/** Sends the browser to Keycloak's sign-in (or, for `register`, create-account) page. */
export async function redirectToKeycloak(mode: KeycloakEntry, returnTo?: string): Promise<void> {
  window.location.assign(await buildKeycloakAuthUrl(mode, returnTo));
}
