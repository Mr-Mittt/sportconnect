import { i18nBuilder } from 'keycloakify/login';
import type { ThemeName } from '../kc.gen';
import en from './messages/en';
import vi from './messages_vi';

/**
 * `keycloakify build` prints "The argument of withCustomTranslations can't be statically evaluated"
 * for the call below. That is known and harmless: the build evaluates that argument in isolation to
 * copy the theme-defined keys into the *server's* messages_<lang>.properties, and ours come from the
 * client's login.json (an import), so it skips them; the browser still gets them at runtime, and the
 * server never renders those keys. What the server DOES render (wrong-password alert, field errors,
 * profile attribute labels) is the plain literal in messages_vi.ts, found through the bare
 * `import('./messages_vi')` below; keep both as they are (a cast or wrapper around that import hides
 * it from the build, and messages_vi.properties silently stops being generated).
 *
 * en + vi. Keycloakify resolves a message as: server -> theme-defined layer (`withCustomTranslations`,
 * falling back to `en`) -> extra-language file (`withExtraLanguages`). So `vi` must live in the
 * theme-defined layer too, or the English custom keys would win (A24 finding 1). That layer's type
 * lists only Keycloakify's 32 shipped languages, hence the spread.
 */
// ofTypeI18n only carries the type (Keycloakify idiom)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { useI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<ThemeName>()
  .withCustomTranslations({
    en,
    ...{ vi },
  })
  .withExtraLanguages({
    vi: { label: 'Tiếng Việt', getMessages: () => import('./messages_vi') },
  })
  .build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
