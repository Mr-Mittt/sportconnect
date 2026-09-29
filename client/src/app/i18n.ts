import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '@/locales/en/common.json';
import enumsEn from '@/locales/en/enums.json';
import homeFeedEn from '@/locales/en/homeFeed.json';
import loginEn from '@/locales/en/login.json';
import profileEn from '@/locales/en/profile.json';
import profilePageEn from '@/locales/en/profilePage.json';
import registerEn from '@/locales/en/register.json';
import sharedComponentsEn from '@/locales/en/sharedComponents.json';
import sharedDialogsEn from '@/locales/en/sharedDialogs.json';
import shellEn from '@/locales/en/shell.json';
import commonVi from '@/locales/vi/common.json';
import enumsVi from '@/locales/vi/enums.json';
import homeFeedVi from '@/locales/vi/homeFeed.json';
import loginVi from '@/locales/vi/login.json';
import profileVi from '@/locales/vi/profile.json';
import profilePageVi from '@/locales/vi/profilePage.json';
import registerVi from '@/locales/vi/register.json';
import sharedComponentsVi from '@/locales/vi/sharedComponents.json';
import sharedDialogsVi from '@/locales/vi/sharedDialogs.json';
import shellVi from '@/locales/vi/shell.json';
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
 * CLIENT-I18N-3: `shell` is the one exception to "one namespace per page" — it holds `TopBar`/
 * `NavTabs`/`AuthLoadingState`/`ComingSoonPage`'s own strings, i.e. the app chrome every
 * authenticated route renders, treated as its own "feature" rather than folded into `common`
 * (reserved for fragments genuinely shared *between* feature namespaces, like `geoLocaleFields`).
 * `sharedDialogs` holds default copy for the 6 dialog components under `shared/components/` that
 * render from more than one page's flow (join feedback, sport-reactivate nudge, unsaved-post
 * guard, add-sport intro, no-sports-to-add, update-broadcast). Each of those 6 accepts an optional
 * `i18nOverridePrefix` prop (i18next `"namespace:key.path"` syntax) that a caller can pass to
 * override specific strings via `useOverridableText` (`shared/lib/useOverridableText.ts`) — i18next's
 * own key-fallback array (`t([override, default])`), not custom resolution logic. No current
 * caller uses the override yet; built ahead of a concrete need, by explicit user decision at this
 * ticket's pickup.
 *
 * CLIENT-I18N-4: `homeFeed` holds `HomeFeedPage`'s own (single) string. `sharedComponents` is
 * `sharedDialogs`'s sibling for non-dialog cross-page pieces under `shared/components/` — `Feed`,
 * `PostCard`, `CommentSection`, `CommentItem`, `CreatePostForm`, `GroupBroadcasts`,
 * `HashtagPostsModal`, `TrendingHashtags`, `SportSwitcher` — each also gets the same
 * `i18nOverridePrefix` + `useOverridableText` pattern CLIENT-I18N-3 established (generalized here
 * to take an explicit default namespace instead of hardcoding `sharedDialogs`). `relativeTime`
 * (used by several of the above, plus not-yet-translated `NotificationRow`) stays in `common`
 * instead, matching `geoLocaleFields`'s "genuinely shared between namespaces" precedent — it's a
 * plain function, not a component, so it reads the i18next singleton directly rather than via
 * `useTranslation()` (see `shared/lib/relativeTime.ts`).
 *
 * CLIENT-I18N-5: `enums` holds the display strings the client generates by branching on a
 * backend-mirrored enum/boolean value (`SessionStatus` + `autoApprove`, `SportAttributeType`'s
 * `BOOLEAN`/`DEFINITION_LIST` arms, `FriendshipStatus`, `NotificationType`), one flat sub-object
 * per source enum. Distinct from every other namespace here: it's not a page or a cross-page
 * component, it's an audit cut across several files that all share "the text depends on which
 * enum member this is." `getNotificationText`/`getSessionStatusLabel`/`attributeValues.tsx`'s
 * value renderers are plain functions (not components), so — same as `relativeTime` — they read
 * the i18next singleton directly rather than via `useTranslation()`. `feeType.ts`/
 * `sessionParticipation.ts` look like the same shape but are deliberately **not** here — filed
 * ahead of this ticket as `CLIENT-I18N-6`'s "client-authored UI copy," not client-mirrored enum
 * labels; see that ticket's own scope note.
 *
 * Imported once, for its side effect, from `main.tsx` (the app entry) — importing it anywhere
 * else risks a second, redundant `init()` call.
 */
void i18next.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      register: registerEn,
      profile: profileEn,
      profilePage: profilePageEn,
      login: loginEn,
      shell: shellEn,
      sharedDialogs: sharedDialogsEn,
      homeFeed: homeFeedEn,
      sharedComponents: sharedComponentsEn,
      enums: enumsEn,
    },
    vi: {
      common: commonVi,
      register: registerVi,
      profile: profileVi,
      profilePage: profilePageVi,
      login: loginVi,
      shell: shellVi,
      sharedDialogs: sharedDialogsVi,
      homeFeed: homeFeedVi,
      sharedComponents: sharedComponentsVi,
      enums: enumsVi,
    },
  },
  lng: useLocaleStore.getState().locale,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'register', 'profile', 'profilePage', 'login', 'shell', 'sharedDialogs', 'homeFeed', 'sharedComponents', 'enums'],
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
