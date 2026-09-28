import { useEffect } from 'react';
import { useUserPreferences } from '@/features/profile/useUserPreferences';
import { useLocaleStore } from './localeStore';

/**
 * CLIENT-I18N-1's tier-1 locale source: once a signed-in user's `UserPreference.language`
 * resolves, pushes it into `localeStore` (which only applies it if it maps to a supported UI
 * locale — see `localeStore.setUserLanguage`). Mounted once at the app root
 * ({@link RootLayout}), next to `useSessionBootstrap` — not per-page, so it runs exactly once
 * per session regardless of which route a user lands on first.
 *
 * `useUserPreferences` is disabled while logged out, so this is a no-op until
 * `useSessionBootstrap`/login populates `authStore.user`. Deliberately does not react to
 * logging back out — see `localeStore.setUserLanguage`'s own doc comment for why.
 */
export function useSyncUserLocale(): void {
  const { data } = useUserPreferences();
  const setUserLanguage = useLocaleStore((state) => state.setUserLanguage);

  useEffect(() => {
    if (data) {
      setUserLanguage(data.language);
    }
  }, [data, setUserLanguage]);
}
