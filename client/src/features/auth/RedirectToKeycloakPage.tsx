import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { safeReturnTo } from './pkce';
import { redirectToKeycloak, type KeycloakEntry } from './redirectToKeycloak';

/**
 * AUTH-14: `/login` and `/register` are no longer forms — both send the browser to Keycloak's hosted
 * page (register opens its create-account step). `ProtectedRoute` still hands over the page the
 * visitor was headed for in `location.state.from`; it is kept in `sessionStorage` with the PKCE pair
 * and used by `/auth/callback`. The ref guard keeps StrictMode's double-run from creating two PKCE
 * pairs (the second would overwrite the first one the browser is already leaving with).
 */
export function RedirectToKeycloakPage({ mode }: { mode: KeycloakEntry }) {
  const { t } = useTranslation('login');
  const location = useLocation();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    const from = (location.state as { from?: string } | null)?.from;
    void redirectToKeycloak(mode, safeReturnTo(from));
  }, [mode, location.state]);

  return (
    <div className="flex min-h-screen items-center justify-center text-2sm text-text-muted" role="status">
      {t('redirecting')}
    </div>
  );
}
