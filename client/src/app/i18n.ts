import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '@/locales/en/common.json';
import commonVi from '@/locales/vi/common.json';
import { useLocaleStore } from './localeStore';

/**
 * CLIENT-I18N-1: app-wide i18n infrastructure. Bundles are statically imported (never fetched
 * over the network) so a locale switch is instant — the opposite tradeoff from A13's
 * server-resolved attribute labels, deliberately (see `I18N_READINESS.md`'s "Relationship to
 * A13" section for why the two mechanisms differ on purpose).
 *
 * Imported once, for its side effect, from `main.tsx` (the app entry) — importing it anywhere
 * else risks a second, redundant `init()` call.
 */
void i18next.use(initReactI18next).init({
  resources: {
    en: { common: commonEn },
    vi: { common: commonVi },
  },
  lng: useLocaleStore.getState().locale,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false }, // React already escapes — avoid double-escaping.
  returnNull: false, // A missing key renders itself (never `null`) if fallbackLng also misses it.
});

// Keeps i18next's active language following localeStore's `locale` for the lifetime of the
// app — this is what "switching language re-renders a translated component" actually means:
// react-i18next's `useTranslation()` subscribes to i18next's own 'languageChanged' event,
// which `changeLanguage` fires.
useLocaleStore.subscribe((state, previousState) => {
  if (state.locale !== previousState.locale) {
    void i18next.changeLanguage(state.locale);
  }
});

export default i18next;
