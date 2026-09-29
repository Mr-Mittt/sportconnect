import { useTranslation } from 'react-i18next';

/**
 * CLIENT-I18N-3: resolves a shared dialog's copy against the `sharedDialogs` namespace by
 * default, with an optional per-caller override. `overridePrefix` is i18next's own
 * `"namespace:key.path"` syntax (e.g. `"profile:save"`) — when given, `${overridePrefix}.${key}`
 * is tried first and `sharedDialogs:${key}` is the fallback, via i18next's native key-fallback
 * array (`t([a, b])` uses the first key that resolves to a real translation). No custom
 * resolution logic; no current caller passes `overridePrefix` yet — built ahead of a concrete
 * need, by explicit user decision at this ticket's pickup.
 */
export function useOverridableText(overridePrefix?: string) {
  const overrideNs = overridePrefix?.split(':')[0];
  const { t } = useTranslation(overrideNs ? [overrideNs, 'sharedDialogs'] : 'sharedDialogs');

  return (key: string, interpolation?: Record<string, unknown>): string =>
    overridePrefix
      ? t([`${overridePrefix}.${key}`, `sharedDialogs:${key}`], interpolation)
      : t(`sharedDialogs:${key}`, interpolation);
}
