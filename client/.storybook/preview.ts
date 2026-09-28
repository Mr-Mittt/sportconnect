import i18next from 'i18next';
import type { Preview } from '@storybook/react-vite';
import { initReactI18next } from 'react-i18next';
import commonEn from '../src/locales/en/common.json';
import registerEn from '../src/locales/en/register.json';
import commonVi from '../src/locales/vi/common.json';
import registerVi from '../src/locales/vi/register.json';
import '../src/index.css';

// CLIENT-I18N-1: a global locale toolbar so any story can be reviewed in `vi` without a real
// language-picker UI existing yet. A separate, minimal i18next instance from the app's own
// (src/app/i18n.ts) — that module imports localeStore.ts (document/localStorage/navigator), and
// this file compiles under tsconfig.node.json's Node-only lib (no DOM types); Storybook stories
// are presentational and reviewed one at a time anyway, not exercising the app's own locale
// source-order logic. Namespace list kept in sync with `src/app/i18n.ts` by hand — see that
// file's doc comment for the one-namespace-per-page convention (CLIENT-REF-2).
void i18next.use(initReactI18next).init({
  resources: {
    en: { common: commonEn, register: registerEn },
    vi: { common: commonVi, register: registerVi },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'register'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
  },
  globalTypes: {
    locale: {
      description: 'UI locale (CLIENT-I18N-1)',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'vi', title: 'Tiếng Việt' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    locale: 'en',
  },
  decorators: [
    (Story, context) => {
      void i18next.changeLanguage(context.globals.locale as string);
      return Story();
    },
  ],
};

export default preview;
