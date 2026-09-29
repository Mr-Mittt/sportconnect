import { describe, expect, it } from 'vitest';
import commonEn from '@/locales/en/common.json';
import homeFeedEn from '@/locales/en/homeFeed.json';
import loginEn from '@/locales/en/login.json';
import profileEn from '@/locales/en/profile.json';
import registerEn from '@/locales/en/register.json';
import sharedComponentsEn from '@/locales/en/sharedComponents.json';
import sharedDialogsEn from '@/locales/en/sharedDialogs.json';
import shellEn from '@/locales/en/shell.json';
import commonVi from '@/locales/vi/common.json';
import homeFeedVi from '@/locales/vi/homeFeed.json';
import loginVi from '@/locales/vi/login.json';
import profileVi from '@/locales/vi/profile.json';
import registerVi from '@/locales/vi/register.json';
import sharedComponentsVi from '@/locales/vi/sharedComponents.json';
import sharedDialogsVi from '@/locales/vi/sharedDialogs.json';
import shellVi from '@/locales/vi/shell.json';

/** Every leaf key path in a nested translation bundle, e.g. `form.email.label`. */
function leafKeyPaths(bundle: unknown, prefix = ''): string[] {
  if (typeof bundle !== 'object' || bundle === null) {
    return [prefix];
  }
  return Object.entries(bundle as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * CLIENT-I18N-2 (per the ticket's own "Notes for pickup"): a bundle pair can silently drift —
 * someone adds a key to `en/x.json` and forgets `vi/x.json` (or vice versa), and nothing catches
 * it until a `t()` call falls back to English mid-Vietnamese-page (i18next's `returnNull: false`
 * renders the raw key instead of throwing, so it's easy to miss). This test is the guard: every
 * `en`/`vi` namespace pair here must have exactly the same set of leaf key paths.
 *
 * Update this table when a new namespace is added (`app/i18n.ts`'s own `resources`/`ns` — keep
 * the two in sync).
 */
const namespacePairs: Record<string, [en: unknown, vi: unknown]> = {
  common: [commonEn, commonVi],
  register: [registerEn, registerVi],
  profile: [profileEn, profileVi],
  login: [loginEn, loginVi],
  shell: [shellEn, shellVi],
  sharedDialogs: [sharedDialogsEn, sharedDialogsVi],
  homeFeed: [homeFeedEn, homeFeedVi],
  sharedComponents: [sharedComponentsEn, sharedComponentsVi],
};

describe('i18n bundle key parity (en vs vi)', () => {
  it.each(Object.entries(namespacePairs))('%s: en and vi have exactly the same key paths', (_name, [en, vi]) => {
    const enKeys = leafKeyPaths(en).sort();
    const viKeys = leafKeyPaths(vi).sort();
    expect(viKeys).toEqual(enKeys);
  });
});
