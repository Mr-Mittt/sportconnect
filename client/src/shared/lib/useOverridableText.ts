import { useTranslation } from 'react-i18next';

/**
 * CLIENT-I18N-3: resolves a shared component's copy against its own default namespace, with an
 * optional per-caller override. `overridePrefix` is i18next's own `"namespace:key.path"` syntax
 * (e.g. `"profile:save"`) — when given, `${overridePrefix}.${key}` is tried first and
 * `${defaultNs}:${key}` is the fallback, via i18next's native key-fallback array (`t([a, b])`
 * uses the first key that resolves to a real translation). No custom resolution logic.
 *
 * CLIENT-I18N-4: generalized from a `sharedDialogs`-only hook (CLIENT-I18N-3 original) to take an
 * explicit `defaultNs`, so it's reusable by any shared component's own namespace, not just the 6
 * original dialogs.
 */
export function useOverridableText(defaultNs: string, overridePrefix?: string) {
  const overrideNs = overridePrefix?.split(':')[0];
  const { t } = useTranslation(overrideNs ? [overrideNs, defaultNs] : defaultNs);

  return (key: string, interpolation?: Record<string, unknown>): string =>
    overridePrefix
      ? t([`${overridePrefix}.${key}`, `${defaultNs}:${key}`], interpolation)
      : t(`${defaultNs}:${key}`, interpolation);
}
