import { useLocation, useNavigate } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { RegisterForm } from './components/RegisterForm';
import { useRegister } from './useRegister';

/**
 * Standalone route (not wrapped in AppShell). Registration also logs the
 * user in, so a successful submit redirects straight into the app — back to
 * wherever ProtectedRoute (AUTH-4) redirected the user from, if any,
 * otherwise Home Feed. Same redirect-back behavior as LoginPage.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { register, isPending, errorMessage } = useRegister({
    onSuccess: () => navigate(from, { replace: true }),
  });

  return (
    <AuthShell>
      <RegisterForm onSubmit={register} isPending={isPending} errorMessage={errorMessage} />
    </AuthShell>
  );
}
