import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { AuthShell } from './AuthShell';

interface AuthCallbackViewProps {
  /** `null` while the code is being exchanged; a localized line when the sign-in failed. */
  errorMessage: string | null;
  /** Starts the sign-in again (a fresh redirect to Keycloak). */
  onRetry: () => void;
}

/**
 * AUTH-14: what `/auth/callback` shows inside the shared auth card — a short "signing you in" line
 * while the code is exchanged, or the failure with a way to start over.
 */
export function AuthCallbackView({ errorMessage, onRetry }: AuthCallbackViewProps) {
  const { t } = useTranslation('login');
  return (
    <AuthShell tagline={t('tagline')}>
      {errorMessage === null ? (
        <p role="status" className="text-2sm text-text-muted">
          {t('callback.signingIn')}
        </p>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t('callback.errorTitle')}</h1>
          <p role="alert" className="mt-2 mb-5 text-2sm text-text-danger">
            {errorMessage}
          </p>
          <Button onClick={onRetry} className="w-full">
            {t('callback.retry')}
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
