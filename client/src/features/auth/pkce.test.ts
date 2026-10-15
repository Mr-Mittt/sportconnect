import { beforeEach, describe, expect, it } from 'vitest';
import {
  codeChallengeFor,
  createCodeVerifier,
  createState,
  safeReturnTo,
  savePkceState,
  takePkceState,
} from './pkce';

describe('pkce', () => {
  beforeEach(() => sessionStorage.clear());

  it('creates a verifier inside the backend window (43 to 128 URL-safe characters), different every time', () => {
    const a = createCodeVerifier();
    const b = createCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a).not.toBe(b);
    expect(createState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('derives the S256 challenge (RFC 7636 appendix B vector)', async () => {
    const challenge = await codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('hands the state over exactly once', () => {
    savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
    expect(takePkceState()).toEqual({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
    expect(takePkceState()).toBeNull();
  });

  it('returns null for a missing or malformed entry', () => {
    expect(takePkceState()).toBeNull();
    sessionStorage.setItem('sportconnect.pkce', 'not json');
    expect(takePkceState()).toBeNull();
    sessionStorage.setItem('sportconnect.pkce', JSON.stringify({ state: 's' }));
    expect(takePkceState()).toBeNull();
  });

  it('only returns to an in-app path', () => {
    expect(safeReturnTo('/posts/12?x=1')).toBe('/posts/12?x=1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
    savePkceState({ codeVerifier: 'v', state: 's', returnTo: '//evil.example' });
    expect(takePkceState()?.returnTo).toBe('/');
  });
});
