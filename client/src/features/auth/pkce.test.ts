import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  codeChallengeFor,
  createCodeVerifier,
  createState,
  PKCE_TTL_MS,
  safeReturnTo,
  savePkceState,
  takePkceState,
} from './pkce';

describe('pkce', () => {
  beforeEach(() => localStorage.clear());

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
    expect(takePkceState('s')).toEqual({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
    expect(takePkceState('s')).toBeNull();
  });

  it('is found from another tab: nothing is kept per tab (an emailed Keycloak link opens a new one)', () => {
    savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
    expect(sessionStorage.length).toBe(0);
    expect(takePkceState('s')?.codeVerifier).toBe('v');
  });

  it('keeps one entry per login attempt, found by its own state', () => {
    savePkceState({ codeVerifier: 'v1', state: 's1', returnTo: '/a' });
    savePkceState({ codeVerifier: 'v2', state: 's2', returnTo: '/b' });
    expect(takePkceState('s2')?.codeVerifier).toBe('v2');
    expect(takePkceState('s1')?.codeVerifier).toBe('v1');
  });

  it('refuses an unknown or missing state without touching other entries', () => {
    savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
    expect(takePkceState('other')).toBeNull();
    expect(takePkceState(null)).toBeNull();
    expect(takePkceState('s')?.codeVerifier).toBe('v');
  });

  describe('expiry', () => {
    afterEach(() => vi.useRealTimers());

    it('still finds the entry when the emailed link is opened in the last minute (29 of 30)', () => {
      vi.useFakeTimers();
      savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
      vi.advanceTimersByTime(29 * 60 * 1000);
      expect(takePkceState('s')?.codeVerifier).toBe('v');
    });

    it('outlasts the 30 minute link by a margin, then refuses', () => {
      vi.useFakeTimers();
      savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
      vi.advanceTimersByTime(PKCE_TTL_MS - 1000);
      expect(PKCE_TTL_MS).toBeGreaterThan(30 * 60 * 1000);
      expect(takePkceState('s')).not.toBeNull();
      savePkceState({ codeVerifier: 'v', state: 's', returnTo: '/groups' });
      vi.advanceTimersByTime(PKCE_TTL_MS + 1000);
      expect(takePkceState('s')).toBeNull();
    });

    it('sweeps expired entries (an abandoned login) when the next one is saved', () => {
      vi.useFakeTimers();
      savePkceState({ codeVerifier: 'old', state: 'old', returnTo: '/' });
      vi.advanceTimersByTime(PKCE_TTL_MS + 1000);
      savePkceState({ codeVerifier: 'new', state: 'new', returnTo: '/' });
      expect(localStorage.getItem('sportconnect.pkce.old')).toBeNull();
      expect(localStorage.getItem('sportconnect.pkce.new')).not.toBeNull();
    });
  });

  it('returns null for a missing or malformed entry', () => {
    expect(takePkceState('s')).toBeNull();
    localStorage.setItem('sportconnect.pkce.s', 'not json');
    expect(takePkceState('s')).toBeNull();
    localStorage.setItem('sportconnect.pkce.s', JSON.stringify({ state: 's', expiresAt: Date.now() + 1000 }));
    expect(takePkceState('s')).toBeNull();
  });

  it('only returns to an in-app path', () => {
    expect(safeReturnTo('/posts/12?x=1')).toBe('/posts/12?x=1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
    savePkceState({ codeVerifier: 'v', state: 's', returnTo: '//evil.example' });
    expect(takePkceState('s')?.returnTo).toBe('/');
  });
});
