import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '@/locales/en/common.json';
import loginEn from '@/locales/en/login.json';
import profileEn from '@/locales/en/profile.json';
import registerEn from '@/locales/en/register.json';
import commonVi from '@/locales/vi/common.json';
import loginVi from '@/locales/vi/login.json';
import profileVi from '@/locales/vi/profile.json';
import registerVi from '@/locales/vi/register.json';
import { useLocaleStore } from './localeStore';

/**
 * CLIENT-I18N-1: app-wide i18n infrastructure. Bundles are statically imported (never fetched
 * over the network) so a locale switch is instant — the opposite tradeoff from A13's
 * server-resolved attribute labels, deliberately (see `I18N_READINESS.md`'s "Relationship to
 * A13" section for why the two mechanisms differ on purpose).
 *
 * **One namespace per page/feature, `common` only for what's genuinely shared** (2026-09-28,
 * CLIENT-REF-2 — anticipated by CLIENT-I18N-2's own "expect to split per feature at pickup" note):
 * `register` is the first page namespace, holding everything specific to the sign-up screen;
 * `profile` (CLIENT-REF-3) is the second, holding `EditProfileModal`'s own strings; `login`
 * (CLIENT-I18N-2 step 1) is the third, holding `LoginForm`/`LoginPage`'s own strings —
 * `geoLocaleFields` stays in `common` since it's shared, but `login`/`register` don't share a
 * namespace with each other despite both being auth-shell forms, since their strings genuinely
 * don't overlap beyond structure. Each page namespace's own keys drop the page name as a prefix
 * (`useTranslation('register')` + `t('form.email.label')`, not `t('register.form.email.label')`)
 * since the namespace already provides that grouping.
 *
 * Imported once, for its side effect, from `main.tsx` (the app entry) — importing it anywhere
 * else risks a second, redundant `init()` call.
 */
void i18next.use(initReactI18next).init({
  resources: {
    en: { common: commonEn, register: registerEn, profile: profileEn, login: loginEn },
    vi: { common: commonVi, register: registerVi, profile: profileVi, login: loginVi },
  },
  lng: useLocaleStore.getState().locale,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'register', 'profile', 'login'],
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
