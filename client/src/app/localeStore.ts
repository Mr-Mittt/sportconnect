import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { detectBrowserLocale, mapToSupportedLocale, type LocaleCode } from '@/shared/lib/locale';

interface LocaleState {
  /**
   * The single active UI locale — everything (i18next, the `Accept-Language` interceptor,
   * locale-keyed queries) reads this one field. Persisted to `localStorage` (survives a hard
   * refresh, unlike sessionStorage-scoped page stores) since it's a language *code*, not a
   * token (client/CLAUDE.md's auth-storage rule is about credentials, not this).
   *
   * Source order (design doc `REFERENCE_DATA_DESIGN.md` §9 / ticket CLIENT-I18N-1): signed-in
   * user's stored language → locally stored choice → `navigator.languages` → `en`. Tiers 2–4
   * are just "whatever `locale` already is" at store creation (rehydrated from storage, or
   * `detectBrowserLocale` if nothing was stored yet) — `setUserLanguage` is the only thing that
   * implements tier 1, by overwriting whatever tiers 2–4 produced.
   */
  locale: LocaleCode;
  /**
   * Explicit user pick (no picker UI ships in this ticket — CLIENT-REF-1/3 wire one later).
   * Always wins immediately: an explicit action is never second-guessed against detection.
   */
  setLocale: (locale: LocaleCode) => void;
  /**
   * Called once a signed-in user's stored `UserPreference.language` resolves (`useSyncUserLocale`).
   * Only takes effect when `language` maps to a supported locale — an unmapped/`null` value
   * (no preference set, deactivated caller, logged out) leaves `locale` at whatever tiers 2–4
   * already produced. Deliberately does not "unwind" on logout: there is no separate
   * explicit-choice field to fall back to, so a user's last active UI language persists after
   * signing out, which is the intended behavior, not a bug.
   */
  setUserLanguage: (language: string | null) => void;
}

/** Real DOM side effect shared by both setters — kept here so `<html lang>` and `locale` can
 * never drift apart, and so it's covered by the same store-level tests the ticket asks for
 * ("Vitest for localeStore (source order, fallback, `<html lang>`)"), not a separate hook. */
function applyDocumentLang(locale: LocaleCode): void {
  document.documentElement.lang = locale;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: detectBrowserLocale(navigator.languages),
      setLocale: (locale) => {
        applyDocumentLang(locale);
        set({ locale });
      },
      setUserLanguage: (language) => {
        const mapped = mapToSupportedLocale(language);
        if (mapped === null) {
          return;
        }
        applyDocumentLang(mapped);
        set({ locale: mapped });
      },
    }),
    {
      name: 'locale-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale }),
      // Rehydration bypasses the setters above (it writes `locale` directly), so the persisted
      // value's `<html lang>` side effect has to be re-applied explicitly once it lands.
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyDocumentLang(state.locale);
        }
      },
    },
  ),
);

// Sets `<html lang>` for the synchronous initial value (`detectBrowserLocale`) immediately at
// module load, not just once persist's async rehydration settles — `onRehydrateStorage` above
// re-applies it if rehydration then swaps in a different persisted locale.
applyDocumentLang(useLocaleStore.getState().locale);
