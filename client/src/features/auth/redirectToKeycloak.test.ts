import { beforeEach, describe, expect, it } from 'vitest';
import { codeChallengeFor, takePkceState } from './pkce';
import { buildKeycloakAuthUrl } from './redirectToKeycloak';

describe('buildKeycloakAuthUrl', () => {
  beforeEach(() => sessionStorage.clear());

  it('builds the Authorization Code + PKCE request for the sportconnect realm', async () => {
    const url = new URL(await buildKeycloakAuthUrl('login', '/groups'));
    expect(url.origin + url.pathname).toBe(
      'http://localhost:8081/realms/sportconnect/protocol/openid-connect/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('sportconnect-web');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/auth/callback`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('ui_locales')).toBe('en');
    expect(url.searchParams.has('prompt')).toBe(false);
  });

  it('stores the verifier, state and returnTo for the callback; the challenge matches the verifier', async () => {
    const url = new URL(await buildKeycloakAuthUrl('login', '/posts/7'));
    const saved = takePkceState();
    expect(saved?.returnTo).toBe('/posts/7');
    expect(saved?.state).toBe(url.searchParams.get('state'));
    expect(await codeChallengeFor(saved!.codeVerifier)).toBe(url.searchParams.get('code_challenge'));
  });

  it('asks for the create-account step when registering', async () => {
    const url = new URL(await buildKeycloakAuthUrl('register'));
    expect(url.searchParams.get('prompt')).toBe('create');
    expect(takePkceState()?.returnTo).toBe('/');
  });
});
