import { useTranslation } from 'react-i18next';

/**
 * Shared "waiting on AUTH-3's session bootstrap to resolve" state, used by
 * both ProtectedRoute and PublicOnlyRoute so neither guard has to decide
 * anything (redirect or render) before authStore.isBootstrapping settles —
 * deciding early is what causes a flash of the wrong content on load.
 */
export function AuthLoadingState() {
  const { t } = useTranslation('shell');
  return (
    <div className="flex min-h-screen items-center justify-center text-2sm text-text-muted">
      {t('loading')}
    </div>
  );
}
