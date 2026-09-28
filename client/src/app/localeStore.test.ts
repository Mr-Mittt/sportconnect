import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from './localeStore';

describe('localeStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    useLocaleStore.getState().setLocale('en');
  });

  it('setLocale is an explicit action — always wins immediately', () => {
    useLocaleStore.getState().setLocale('vi');

    expect(useLocaleStore.getState().locale).toBe('vi');
  });

  it('setLocale updates <html lang>', () => {
    useLocaleStore.getState().setLocale('vi');

    expect(document.documentElement.lang).toBe('vi');
  });

  it('setUserLanguage (tier 1) overrides whatever locale was already active', () => {
    useLocaleStore.getState().setLocale('en');

    useLocaleStore.getState().setUserLanguage('vi');

    expect(useLocaleStore.getState().locale).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
  });

  it('setUserLanguage maps a region-tagged code onto its supported base language', () => {
    useLocaleStore.getState().setUserLanguage('vi-VN');

    expect(useLocaleStore.getState().locale).toBe('vi');
  });

  it('setUserLanguage is a no-op for an unsupported language — leaves locale untouched', () => {
    useLocaleStore.getState().setLocale('vi');

    useLocaleStore.getState().setUserLanguage('fr');

    expect(useLocaleStore.getState().locale).toBe('vi');
  });

  it('setUserLanguage is a no-op for null (no preference set / logged out)', () => {
    useLocaleStore.getState().setLocale('vi');

    useLocaleStore.getState().setUserLanguage(null);

    expect(useLocaleStore.getState().locale).toBe('vi');
  });

  it('persists the active locale to localStorage under its own key', () => {
    useLocaleStore.getState().setLocale('vi');

    const stored = localStorage.getItem('locale-storage');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).state.locale).toBe('vi');
  });
});
