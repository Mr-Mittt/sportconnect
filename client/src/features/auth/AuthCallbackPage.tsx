import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { AuthCallbackView } from './components/AuthCallbackView';
import { ReactivateAccountDialog } from './components/ReactivateAccountDialog';
import { takePkceState } from './pkce';
import { redirectToKeycloak } from './redirectToKeycloak';
import { useAuthCallback } from './useAuthCallback';
import { useReactivate } from './useReactivate';

/**
 * AUTH-14: Keycloak sends the browser back here with `?code=…&state=…` (or `?error=…`). The page
 * looks up the PKCE entry stored under `state` before the redirect (any tab of this browser: an emailed Keycloak
 * link finishes the login in a new tab), posts `{code, codeVerifier}` to the
 * backend once, and then:
 * - success → into the app, at the path `ProtectedRoute` had redirected from (`returnTo`);
 * - a deactivated password user → `ReactivateAccountDialog` with the one-time ticket (Confirm
 *   re-activates, Cancel declines and returns to `/login`); social users are re-activated by the
 *   backend and never see it;
 * - anything else (error parameter, `state` mismatch, missing PKCE entry, backend failure) → an error
 *   view with "Try again", which starts a fresh sign-in.
 *
 * The exchange waits for the session bootstrap to settle so its refresh-cookie check cannot race the
 * cookie this call sets, and runs once (a code is single-use; StrictMode would otherwise post twice).
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const hasExchanged = useRef(false);
  const returnTo = useRef('/');
  const [ticket, setTicket] = useState<string | null>(null);

  const enterApp = () => navigate(returnTo.current, { replace: true });
  const callback = useAuthCallback({ onSuccess: enterApp, onAccountDeactivated: setTicket });
  const reactivation = useReactivate({
    onSuccess: enterApp,
    onCancelled: () => navigate('/login', { replace: true }),
  });

  const { exchange } = callback;
  useEffect(() => {
    if (isBootstrapping || hasExchanged.current) return;
    hasExchanged.current = true;

    const saved = takePkceState(params.get('state'));
    const code = params.get('code');
    if (params.get('error') || !code || !saved) {
      exchange('invalid');
      return;
    }
    returnTo.current = saved.returnTo;
    exchange({ code, codeVerifier: saved.codeVerifier });
  }, [isBootstrapping, params, exchange]);

  return (
    <>
      <AuthCallbackView
        errorMessage={ticket === null ? callback.errorMessage : null}
        onRetry={() => void redirectToKeycloak('login', returnTo.current)}
      />
      <ReactivateAccountDialog
        isOpen={ticket !== null}
        onClose={() => ticket && reactivation.cancel(ticket)}
        onConfirm={() => ticket && reactivation.reactivate(ticket)}
        isSubmitting={reactivation.isPending}
        errorMessage={reactivation.errorMessage}
      />
    </>
  );
}
