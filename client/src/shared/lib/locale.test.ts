import { describe, expect, it } from 'vitest';
import { detectBrowserLocale, mapToSupportedLocale } from './locale';

describe('mapToSupportedLocale', () => {
  it('matches an exact supported code', () => {
    expect(mapToSupportedLocale('en')).toBe('en');
    expect(mapToSupportedLocale('vi')).toBe('vi');
  });

  it('matches by base-language subtag', () => {
    expect(mapToSupportedLocale('en-US')).toBe('en');
    expect(mapToSupportedLocale('vi-VN')).toBe('vi');
  });

  it('is case-insensitive', () => {
    expect(mapToSupportedLocale('EN-us')).toBe('en');
  });

  it('returns null for an unsupported language', () => {
    expect(mapToSupportedLocale('fr')).toBeNull();
    expect(mapToSupportedLocale('fr-FR')).toBeNull();
  });

  it('returns null for null/undefined/empty', () => {
    expect(mapToSupportedLocale(null)).toBeNull();
    expect(mapToSupportedLocale(undefined)).toBeNull();
    expect(mapToSupportedLocale('')).toBeNull();
  });
});

describe('detectBrowserLocale', () => {
  it('picks the first supported entry in navigator.languages order', () => {
    expect(detectBrowserLocale(['fr-FR', 'vi-VN', 'en-US'])).toBe('vi');
  });

  it('falls back to en when nothing matches', () => {
    expect(detectBrowserLocale(['fr-FR', 'de-DE'])).toBe('en');
  });

  it('falls back to en for an empty list', () => {
    expect(detectBrowserLocale([])).toBe('en');
  });
});
