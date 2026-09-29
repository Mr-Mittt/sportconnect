import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { LoginForm } from './components/LoginForm';
import { useLogin } from './useLogin';

/**
 * Standalone route (not wrapped in AppShell — TopBar/NavTabs assume an
 * authenticated user). On successful login, redirects into the app — back
 * to wherever ProtectedRoute (AUTH-4) redirected the user from, if any,
 * otherwise Home Feed.
 */
export function LoginPage() {
  // CLIENT-I18N-2: translated tagline passed as a prop — same "AuthShell doesn't translate its
  // own default" reasoning RegisterPage already established (that default is this component's own
  // untranslated fallback, never rendered once every AuthShell caller passes its own).
  const { t } = useTranslation('login');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { login, isPending, errorMessage } = useLogin({
    onSuccess: () => navigate(from, { replace: true }),
  });

  return (
    <AuthShell tagline={t('tagline')}>
      <LoginForm onSubmit={login} isPending={isPending} errorMessage={errorMessage} />
    </AuthShell>
  );
}
