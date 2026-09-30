import i18next from 'i18next';
import type { Preview } from '@storybook/react-vite';
import { initReactI18next } from 'react-i18next';
import commonEn from '../src/locales/en/common.json';
import enumsEn from '../src/locales/en/enums.json';
import friendsEn from '../src/locales/en/friends.json';
import groupsEn from '../src/locales/en/groups.json';
import homeFeedEn from '../src/locales/en/homeFeed.json';
import loginEn from '../src/locales/en/login.json';
import notificationsEn from '../src/locales/en/notifications.json';
import accountSettingsEn from '../src/locales/en/accountSettings.json';
import profileEn from '../src/locales/en/profile.json';
import profilePageEn from '../src/locales/en/profilePage.json';
import registerEn from '../src/locales/en/register.json';
import sessionEn from '../src/locales/en/session.json';
import sharedComponentsEn from '../src/locales/en/sharedComponents.json';
import sharedDialogsEn from '../src/locales/en/sharedDialogs.json';
import shellEn from '../src/locales/en/shell.json';
import commonVi from '../src/locales/vi/common.json';
import enumsVi from '../src/locales/vi/enums.json';
import friendsVi from '../src/locales/vi/friends.json';
import groupsVi from '../src/locales/vi/groups.json';
import homeFeedVi from '../src/locales/vi/homeFeed.json';
import loginVi from '../src/locales/vi/login.json';
import notificationsVi from '../src/locales/vi/notifications.json';
import accountSettingsVi from '../src/locales/vi/accountSettings.json';
import profileVi from '../src/locales/vi/profile.json';
import profilePageVi from '../src/locales/vi/profilePage.json';
import registerVi from '../src/locales/vi/register.json';
import sessionVi from '../src/locales/vi/session.json';
import sharedComponentsVi from '../src/locales/vi/sharedComponents.json';
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
//
// CLIENT-I18N-4: added `homeFeed` (HomeFeedPage's own string) and `sharedComponents`
// (Feed/PostCard/CommentSection/CommentItem/CreatePostForm/GroupBroadcasts/HashtagPostsModal/
// TrendingHashtags/SportSwitcher's default copy) — same sync-by-hand note applies.
//
// CLIENT-I18N-5: added `enums` (client-mirrored backend enum display strings — session status,
// sport attribute BOOLEAN/DEFINITION_LIST, friendship status, notification text) — same
// sync-by-hand note applies.
void i18next.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      register: registerEn,
      accountSettings: accountSettingsEn,
      profile: profileEn,
      profilePage: profilePageEn,
      login: loginEn,
      shell: shellEn,
      sharedDialogs: sharedDialogsEn,
      homeFeed: homeFeedEn,
      sharedComponents: sharedComponentsEn,
      enums: enumsEn,
      groups: groupsEn,
      session: sessionEn,
      friends: friendsEn,
      notifications: notificationsEn,
    },
    vi: {
      common: commonVi,
      register: registerVi,
      accountSettings: accountSettingsVi,
      profile: profileVi,
      profilePage: profilePageVi,
      login: loginVi,
      shell: shellVi,
      sharedDialogs: sharedDialogsVi,
      homeFeed: homeFeedVi,
      sharedComponents: sharedComponentsVi,
      enums: enumsVi,
      groups: groupsVi,
      session: sessionVi,
      friends: friendsVi,
      notifications: notificationsVi,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'register', 'accountSettings', 'profile', 'profilePage', 'login', 'shell', 'sharedDialogs', 'homeFeed', 'sharedComponents', 'enums', 'groups', 'friends', 'notifications', 'session'],
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
