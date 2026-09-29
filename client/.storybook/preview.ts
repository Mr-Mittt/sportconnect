import i18next from 'i18next';
import type { Preview } from '@storybook/react-vite';
import { initReactI18next } from 'react-i18next';
import commonEn from '../src/locales/en/common.json';
import loginEn from '../src/locales/en/login.json';
import profileEn from '../src/locales/en/profile.json';
import registerEn from '../src/locales/en/register.json';
import sharedDialogsEn from '../src/locales/en/sharedDialogs.json';
import shellEn from '../src/locales/en/shell.json';
import commonVi from '../src/locales/vi/common.json';
import loginVi from '../src/locales/vi/login.json';
import profileVi from '../src/locales/vi/profile.json';
import registerVi from '../src/locales/vi/register.json';
import sharedDialogsVi from '../src/locales/vi/sharedDialogs.json';
import shellVi from '../src/locales/vi/shell.json';
import '../src/index.css';

// CLIENT-I18N-1: a global locale toolbar so any story can be reviewed in `vi` without a real
// language-picker UI existing yet. A separate, minimal i18next instance from the app's own
// (src/app/i18n.ts) — that module imports localeStore.ts (document/localStorage/navigator), and
// this file compiles under tsconfig.node.json's Node-only lib (no DOM types); Storybook stories
// are presentational and reviewed one at a time anyway, not exercising the app's own locale
// source-order logic. Namespace list kept in sync with `src/app/i18n.ts` by hand — see that
// file's doc comment for the one-namespace-per-page convention (CLIENT-REF-2).
//
// CLIENT-I18N-2: found `profile` (CLIENT-REF-3) was never added here — `EditProfileModal` stories
// reviewed under the `vi` toolbar were showing raw untranslated keys (`profile:title`, etc.)
// instead of Vietnamese text, since this instance never knew that namespace existed. Fixed here
// alongside adding `login` (this ticket's own new namespace).
//
// CLIENT-I18N-3: added `shell` (TopBar/NavTabs/AuthLoadingState/ComingSoonPage) and
// `sharedDialogs` (the 6 cross-page dialog components' default copy) — same "keep this list in
// sync with app/i18n.ts by hand" note above applies to these two as well.
void i18next.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      register: registerEn,
      profile: profileEn,
      login: loginEn,
      shell: shellEn,
      sharedDialogs: sharedDialogsEn,
    },
    vi: {
      common: commonVi,
      register: registerVi,
      profile: profileVi,
      login: loginVi,
      shell: shellVi,
      sharedDialogs: sharedDialogsVi,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'register', 'profile', 'login', 'shell', 'sharedDialogs'],
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
