import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccountNoticeStore } from './accountNoticeStore';
import { AuthShell } from './components/AuthShell';
import { LoginForm } from './components/LoginForm';
import { ReactivateAccountDialog } from './components/ReactivateAccountDialog';
import type { LoginPayload } from './types';
import { useLogin } from './useLogin';
import { useReactivate } from './useReactivate';

/**
 * Standalone route (not wrapped in AppShell — TopBar/NavTabs assume an
 * authenticated user). On successful login, redirects into the app — back
 * to wherever ProtectedRoute (AUTH-4) redirected the user from, if any,
 * otherwise Home Feed.
 *
 * AUTH-10: when login answers `ACCOUNT_DEACTIVATED`, the credentials just submitted are kept in
 * `pendingReactivation` (local state only — never a store, storage or the URL) so the confirm
 * dialog can re-send them to `/auth/reactivate` without the user retyping. They are dropped when
 * the dialog closes, and the page unmounts on success.
 */
export function LoginPage() {
  // CLIENT-I18N-2: translated tagline passed as a prop — same "AuthShell doesn't translate its
  // own default" reasoning RegisterPage already established (that default is this component's own
  // untranslated fallback, never rendered once every AuthShell caller passes its own).
  const { t } = useTranslation('login');
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; passwordReset?: boolean } | null;
  const from = state?.from ?? '/';
  // ACCOUNT-4: set when the user just deactivated their own account; cleared once they sign in again.
  const justDeactivated = useAccountNoticeStore((store) => store.deactivated);
  const setDeactivatedNotice = useAccountNoticeStore((store) => store.setDeactivated);
  const [pendingReactivation, setPendingReactivation] = useState<LoginPayload | null>(null);
  const goToDestination = () => {
    setDeactivatedNotice(false);
    navigate(from, { replace: true });
  };
  const { login, isPending, errorMessage } = useLogin({
    onSuccess: goToDestination,
    onAccountDeactivated: setPendingReactivation,
  });
  const reactivation = useReactivate({ onSuccess: goToDestination });

  function closeReactivation() {
    setPendingReactivation(null);
    reactivation.reset();
  }

  return (
    <AuthShell tagline={t('tagline')}>
      <LoginForm
        onSubmit={login}
        isPending={isPending}
        errorMessage={errorMessage}
        showPasswordResetNotice={state?.passwordReset === true}
        showDeactivatedNotice={justDeactivated}
      />
      <ReactivateAccountDialog
        isOpen={pendingReactivation !== null}
        onClose={closeReactivation}
        onConfirm={() => pendingReactivation && reactivation.reactivate(pendingReactivation)}
        isSubmitting={reactivation.isPending}
        errorMessage={reactivation.errorMessage}
      />
    </AuthShell>
  );
}
