import { useNavigate } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { LoginForm } from './components/LoginForm';
import { useLogin } from './useLogin';

/**
 * Standalone route (not wrapped in AppShell — TopBar/NavTabs assume an
 * authenticated user). On successful login, redirects straight into the app
 * (no intermediate step).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const { login, isPending, errorMessage } = useLogin({
    onSuccess: () => navigate('/'),
  });

  return (
    <AuthShell>
      <LoginForm onSubmit={login} isPending={isPending} errorMessage={errorMessage} />
    </AuthShell>
  );
}
