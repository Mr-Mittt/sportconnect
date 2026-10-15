import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface LogoutFailedDialogProps {
  isOpen: boolean;
  /** "Try again": repeats the logout. */
  onRetry: () => void;
  /** "Stay signed in", the close action and Esc: keeps the session and closes the dialog. */
  onStay: () => void;
  isRetrying: boolean;
}

/**
 * AUTH-14: shown when `POST /auth/logout` answered 503 (Keycloak unreachable). The backend keeps
 * the refresh cookie in that case, so the user is still signed in — this dialog says so instead of
 * pretending the sign-out worked.
 */
export function LogoutFailedDialog({ isOpen, onRetry, onStay, isRetrying }: LogoutFailedDialogProps) {
  const { t } = useTranslation('login');
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onStay()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t('logoutFailed.title')}</DialogTitle>
        <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('logoutFailed.body')}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? t('logoutFailed.retrying') : t('logoutFailed.retry')}
          </Button>
          <Button variant="outline" size="sm" onClick={onStay} disabled={isRetrying}>
            {t('logoutFailed.stay')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
