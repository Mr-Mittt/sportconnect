/**
 * CLIENT-I18N-1: the UI's supported locale set — deliberately just `en`/`vi` for now (BCP 47
 * codes, matching A13/the `languages` table, never the ISO 3166 country code mistake). Adding a
 * third locale is a bundle + this array, per the ticket's "general N-locale framework" scope.
 */
export const SUPPORTED_LOCALES = ['en', 'vi'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

/**
 * Maps an arbitrary BCP 47 tag (`"en"`, `"en-US"`, `"vi-VN"`, a signed-in user's stored
 * `UserPreference.language`, a `navigator.languages` entry) onto one of our supported UI
 * locales — exact match first, then the base-language subtag (`"en-US"` → `"en"`). Returns
 * `null` for anything unsupported (`"fr"`, `"fr-FR"`) so the caller can fall through to the
 * next source-order tier instead of guessing.
 */
export function mapToSupportedLocale(raw: string | null | undefined): LocaleCode | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((locale) => locale === normalized);
  if (exact) {
    return exact;
  }
  const base = normalized.split('-')[0];
  return SUPPORTED_LOCALES.find((locale) => locale === base) ?? null;
}

/**
 * First `navigator.languages` entry that maps onto a supported locale, else `'en'` — the last
 * two tiers of `localeStore`'s source order (browser → `en`), used both as the store's initial
 * value (nothing persisted yet) and by anything wanting the "no explicit signal" fallback.
 */
export function detectBrowserLocale(languages: readonly string[]): LocaleCode {
  for (const language of languages) {
    const mapped = mapToSupportedLocale(language);
    if (mapped) {
      return mapped;
    }
  }
  return 'en';
}
